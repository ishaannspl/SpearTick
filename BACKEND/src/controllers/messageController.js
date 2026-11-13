const Contact = require("../models/contact");
const Conversation = require("../models/conversation");
const Message = require("../models/message");
const User = require("../models/user");
const ROLES = require("../constants/roles");
const { emitToCompany } = require("../sockets/socket");
const Campaign = require("../models/campaign");
const Company = require("../models/company");
const { resolveNumberId, primaryNumberId } = require("../utils/whatsappNumberList");

const { recalculateCampaignStats } = require("./campaignController");
const {
  getConversationSettings,
} = require("../services/whatsapp/conversationService");
const {
  findOrCreateContact,
  findOrCreateConversation,
  createMessage,
  updateConversation,
} = require("../services/whatsapp/messageService");

// WhatsApp's real delivery lifecycle is pending -> sent -> delivered ->
// read, with `failed` as a separate terminal outcome that can arrive
// *instead of* (or after) `sent` once Meta actually attempts delivery.
// Treating `failed` as strictly lower-priority than `sent` — as a single
// linear scale would — silently drops a genuine late "this couldn't be
// delivered" event once a message is already marked "sent". This function
// only blocks a status update when it would move a message *backwards*
// after delivery/read has already been confirmed.
const STATUS_PROGRESSION = { pending: 0, sent: 1, delivered: 2, read: 3 };

// Which per-contact Campaign timestamp field a given webhook status stamps —
// only delivered/read/failed arrive this way; sent is stamped at send time
// in campaignSenderService.js instead.
const WEBHOOK_STATUS_TIMESTAMP_FIELD = {
  delivered: "deliveredAt",
  read: "readAt",
  failed: "failedAt",
};

const shouldApplyStatusUpdate = (currentStatus, incomingStatus) => {
  if (currentStatus === incomingStatus) return false;

  if (incomingStatus === "failed") {
    // Always honor a failure unless delivery was already confirmed — a
    // stray/late "failed" arriving after "delivered" or "read" is
    // nonsensical and shouldn't downgrade a confirmed successful delivery.
    return currentStatus !== "delivered" && currentStatus !== "read";
  }

  const current = STATUS_PROGRESSION[currentStatus] ?? 0;
  const incoming = STATUS_PROGRESSION[incomingStatus] ?? 0;
  return incoming > current;
};

const saveMessage = async (req, res) => {
  try {
    const {
      phone,
      message,
      sender,
      name,
      status,
      campaignId,
      whatsappMessageId,
      senderName,
    } = req.body;
    const { companyId } = req;

    // Which of the company's numbers this message travels on: the requested
    // one if it really belongs to this company, otherwise the default. A
    // number from another company can never be used here.
    const company = await Company.findById(companyId).select("whatsapp").lean();
    let requestedNumberId = req.body.phoneNumberId;
    // A save that names its conversation (the inbox's plain-save fallback)
    // stays on that conversation's number.
    if (!requestedNumberId && req.body.conversationId) {
      const chat = await Conversation.findOne({
        _id: req.body.conversationId,
        companyId,
      })
        .select("phoneNumberId")
        .lean();
      requestedNumberId = chat?.phoneNumberId || primaryNumberId(company);
    }
    const phoneNumberId = resolveNumberId(company, requestedNumberId);

    // 1. Find or create contact
    const contact = await findOrCreateContact({
      companyId,
      phone,
      name,
    });

    // 2. Find or create the conversation for this contact on this number
    const conversation = await findOrCreateConversation(companyId, contact._id, phoneNumberId);

    let replyAttributedCampaign = null;

    if (sender === "user") {
      const lastCampaignMessage = await Message.findOne({
        companyId,
        conversation: conversation._id,
        sender: "agent",
        campaignId: { $ne: null },
      }).sort({
        createdAt: -1,
      });

      if (lastCampaignMessage) {
        const hoursDifference =
          (Date.now() - new Date(lastCampaignMessage.createdAt).getTime()) /
          (1000 * 60 * 60);

        if (hoursDifference <= 48) {
          replyAttributedCampaign = lastCampaignMessage.campaignId;

          // First-reply-only stamp — $elemMatch (not two separate dot-path
          // conditions) is required here: with separate "contacts.phone"/
          // "contacts.repliedAt" conditions, Mongo would consider the query
          // satisfied if *any* element matches the phone and *any other*
          // element (e.g. a different contact who hasn't replied yet) has a
          // null repliedAt, then apply $set via the positional operator to
          // an ambiguous element. $elemMatch forces both conditions onto the
          // same array element, making this genuinely idempotent if the
          // same contact replies more than once inside the attribution
          // window — this is the only place that links a reply back onto
          // the campaign's per-contact record.
          const updatedCampaign = await Campaign.findOneAndUpdate(
            {
              _id: replyAttributedCampaign,
              companyId,
              contacts: { $elemMatch: { phone, repliedAt: null } },
            },
            {
              $set: { "contacts.$.repliedAt": new Date() },
              $inc: { repliedCount: 1 },
            },
            { new: true },
          );

          if (updatedCampaign) {
            emitToCompany(companyId, "campaigns", "campaign_updated", updatedCampaign);
          }
        }
      }
    }
    // 3. Save message
    const newMessage = await createMessage({
      companyId,
      conversationId: conversation._id,
      sender,
      message,
      status,
      campaignId,
      whatsappMessageId,
      replyAttributedCampaign,
      senderName,
      mediaUrl: req.body.mediaUrl || "",
      mediaType: req.body.mediaType || "",
      failure: req.body.failure || null,
    });

    // A person replying (not a campaign) answers the AI's hand-over, so the
    // chat leaves the "Needs a reply" list.
    if (sender === "agent" && !campaignId && status !== "failed" && conversation.escalationReason) {
      conversation.escalationReason = null;
      conversation.escalatedAt = null;
    }

    // 4. Update last message
    await updateConversation({
      conversation,
      message,
      sender,
    });
    const updatedConversation = await Conversation.findById(
      conversation._id,
    ).populate("contact");

    emitToCompany(companyId, "inbox", "new_message", newMessage);
    emitToCompany(companyId, "inbox", "conversation_updated", updatedConversation);

    contact.lastMessage = message;
    await contact.save();

    res.status(201).json({
      success: true,
      phone,
      campaignId,
      message: "Message saved",
      data: newMessage,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

const MAX_CONVERSATIONS_PAGE_SIZE = 100;
const DEFAULT_CONVERSATIONS_PAGE_SIZE = 50;

const getConversations = async (req, res) => {
  try {
    const limit = Math.min(
      Number(req.query.limit) || DEFAULT_CONVERSATIONS_PAGE_SIZE,
      MAX_CONVERSATIONS_PAGE_SIZE,
    );

    // Cursor-based, not offset-based: this list re-sorts constantly (any
    // new message bumps a conversation to the top), so "page 2" by offset
    // would skip or duplicate rows as conversations shift around between
    // requests. "Give me everything older than this timestamp" doesn't
    // have that problem.
    const before = req.query.before ? new Date(req.query.before) : null;
    const filter = {
      companyId: req.companyId,
      ...(before ? { lastMessageTime: { $lt: before } } : {}),
    };

    // Chats made before multi-number support carry no number; they belong to
    // the company's primary number, so they are shown (and filtered) as such.
    const company = await Company.findById(req.companyId).select("whatsapp").lean();
    const primaryId = primaryNumberId(company);
    const numberFilter = req.query.phoneNumberId ? String(req.query.phoneNumberId) : "";

    if (numberFilter) {
      filter.$and = [
        numberFilter === primaryId
          ? { $or: [{ phoneNumberId: numberFilter }, { phoneNumberId: { $in: ["", null] } }] }
          : { phoneNumberId: numberFilter },
      ];
    }

    const rows = await Conversation.find(filter)
      .populate("contact")
      .populate("assignedAgent", "_id name email")
      .sort({ lastMessageTime: -1 })
      .limit(limit + 1); // fetch one extra to know if there's another page

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const conversations = page.map((row) => {
      const plain = row.toObject();
      if (!plain.phoneNumberId) plain.phoneNumberId = primaryId;
      return plain;
    });
    const nextCursor =
      conversations.length > 0
        ? conversations[conversations.length - 1].lastMessageTime
        : null;

    res.status(200).json({ conversations, hasMore, nextCursor });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Failed to fetch conversations",
      error: error.message,
    });
  }
};

const getMessagesbyConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const before = req.query.before; // ISO date string — load messages older than this

    const query = {
      companyId: req.companyId,
      conversation: conversationId,
    };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    // Fetch newest-first (so `limit` gets the most RECENT page), then
    // reverse in memory so the response is chronological ascending —
    // that's the order the frontend already expects to render in.
    const page = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1); // fetch one extra to detect if there's more

    const hasMore = page.length > limit;
    const messages = (hasMore ? page.slice(0, limit) : page).reverse();
    const nextCursor = hasMore ? messages[0].createdAt.toISOString() : null;

    res.status(200).json({ messages, hasMore, nextCursor });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Failed to fetch messages",
      error: error.message,
    });
  }
};

const markConversationAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const conversation = await Conversation.findOne({
      _id: conversationId,
      companyId: req.companyId,
    });

    if (!conversation) {
      return res.status(404).json({
        message: "Conversation not found",
      });
    }
    conversation.unreadCount = 0;

    await conversation.save();

    res.status(200).json({
      message: "Conversation marked as read",
      conversation,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to mark as read",
      error: error.message,
    });
  }
};

const { sendTextMessage, sendMediaMessage, mediaKindOf } = require("../services/whatsapp/whatsappService");
const { sendTemplateMessage } = require("../services/whatsapp/templateService");
const Template = require("../models/template");
const { normalizePhone } = require("../utils/phone");

// Same token rule as the template editor: {{name}}, {{1}}, ... in order of
// first appearance.
const extractVariableTokens = (text = "") => {
  const seen = [];
  for (const match of String(text).matchAll(/\{\{(\w+)\}\}/g)) {
    if (!seen.includes(match[1])) seen.push(match[1]);
  }
  return seen;
};
const {
  getCompanyWhatsAppCredentials,
} = require("../services/whatsapp/companyCredentials");

const ROLE_LABELS = {
  ADMIN: "Admin",
  SUPPORT_AGENT: "Support",
  CAMPAIGN_MANAGER: "Sales",
  TEAM_LEAD: "Team Lead",
};

const resolveSenderName = async (req) => {
  if (!req.user?.userId) return null;

  const agent = await User.findById(req.user.userId).select("name role");

  return agent?.name || ROLE_LABELS[agent?.role] || null;
};

const sendMessage = async (req, res) => {
  const { phone, message, sender, conversationId } = req.body;
  const senderName = await resolveSenderName(req);

  try {
    // A reply goes out from the number its chat belongs to - never from
    // whichever number happens to be the default.
    let phoneNumberId = "";
    if (conversationId) {
      const chat = await Conversation.findOne({ _id: conversationId, companyId: req.companyId }).select(
        "phoneNumberId",
      );
      if (!chat) {
        return res.status(404).json({ success: false, message: "Conversation not found" });
      }
      if (chat.phoneNumberId) {
        phoneNumberId = chat.phoneNumberId;
      } else {
        const company = await Company.findById(req.companyId).select("whatsapp").lean();
        phoneNumberId = primaryNumberId(company);
      }
    }
    // saveMessage reads this to file the message under the same chat.
    req.body.phoneNumberId = phoneNumberId;

    const credentials = await getCompanyWhatsAppCredentials(req.companyId, phoneNumberId || undefined);
    if (!credentials) {
      return res.status(400).json({
        success: false,
        message: "Connect a WhatsApp Business Account before sending messages",
      });
    }

    const metaResponse = await sendTextMessage(credentials, phone, message);

    req.body.sender = sender || "agent";
    req.body.status = "sent";
    req.body.senderName = senderName;
    // Without this, a reply sent from the inbox never gets its delivery
    // status (sent -> delivered -> read) updated later, since
    // updateMessageStatus matches incoming webhook events by this field.
    req.body.whatsappMessageId = metaResponse.messages?.[0]?.id;

    await saveMessage(req, res);
  } catch (error) {
    console.log(error.response?.data || error.message);

    // Keep Meta's reason so the inbox can explain why it wasn't sent.
    const metaError = error.response?.data?.error;
    req.body.sender = sender || "agent";
    req.body.status = "failed";
    req.body.senderName = senderName;
    req.body.failure = metaError
      ? {
          code: metaError.code ? String(metaError.code) : null,
          title: metaError.error_user_title || metaError.type || null,
          message: metaError.message || null,
          details: metaError.error_data?.details || null,
        }
      : { code: null, title: null, message: error.message || null, details: null };

    await saveMessage(req, res);
  }
};

// Sends an approved template inside a chat — the only way to message a
// customer after the 24-hour reply window has closed, or to start a new
// chat. Takes either a conversationId (existing chat) or a phone (new chat).
const sendTemplateInChat = async (req, res) => {
  const { conversationId, templateId, variables, buttonVariables } = req.body;
  const senderName = await resolveSenderName(req);

  try {
    // As given: findOrCreateContact matches both this and its normalised
    // form, so contacts saved before normalisation aren't duplicated.
    let phone = String(req.body.phone || "").trim();
    let phoneNumberId = "";

    if (conversationId) {
      const chat = await Conversation.findOne({ _id: conversationId, companyId: req.companyId })
        .select("phoneNumberId contact")
        .populate("contact", "phone");
      if (!chat) {
        return res.status(404).json({ success: false, message: "Conversation not found" });
      }
      phone = chat.contact?.phone || phone;
      if (chat.phoneNumberId) {
        phoneNumberId = chat.phoneNumberId;
      } else {
        const company = await Company.findById(req.companyId).select("whatsapp").lean();
        phoneNumberId = primaryNumberId(company);
      }
    }

    if (!phone) {
      return res.status(400).json({ success: false, message: "Choose who to send the template to." });
    }

    const template = await Template.findOne({ _id: templateId, companyId: req.companyId });
    if (!template) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }
    if (template.metaStatus !== "APPROVED") {
      return res.status(400).json({
        success: false,
        message: "This template isn't approved by WhatsApp yet, so it can't be sent.",
      });
    }

    const credentials = await getCompanyWhatsAppCredentials(req.companyId, phoneNumberId || undefined);
    if (!credentials) {
      return res.status(400).json({
        success: false,
        message: "Connect a WhatsApp Business Account before sending messages",
      });
    }

    const values = (Array.isArray(variables) ? variables : []).map((v) => String(v ?? "").trim());
    const buttonValues = (Array.isArray(buttonVariables) ? buttonVariables : []).map((v) => String(v ?? "").trim());
    const metaResponse = await sendTemplateMessage(credentials, normalizePhone(phone) || phone, template, values, buttonValues);

    // Stored as the text the customer actually sees.
    let shownText = template.description || "";
    extractVariableTokens(shownText).forEach((token, i) => {
      shownText = shownText.split(`{{${token}}}`).join(values[i] || "");
    });

    req.body.phone = phone;
    req.body.message = shownText;
    req.body.sender = "agent";
    req.body.status = "sent";
    req.body.senderName = senderName;
    req.body.phoneNumberId = phoneNumberId || credentials.phoneNumberId;
    req.body.whatsappMessageId = metaResponse.messages?.[0]?.id;

    await saveMessage(req, res);
  } catch (error) {
    console.log(error.response?.data || error.message);
    const metaError = error.response?.data?.error;
    res.status(502).json({
      success: false,
      message:
        metaError?.error_data?.details ||
        metaError?.message ||
        "WhatsApp didn't accept the template. Please try again.",
      code: metaError?.code ? String(metaError.code) : undefined,
    });
  }
};

const MEDIA_LABELS = { image: "📷 Photo", video: "🎬 Video", audio: "🎤 Audio", document: "📄 Document" };

// Sends a photo, video or document from the inbox (multipart: file, caption,
// conversationId). Only works inside the 24-hour reply window, like text.
const sendMediaInChat = async (req, res) => {
  const { conversationId, caption } = req.body;
  const senderName = await resolveSenderName(req);

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Choose a file to send." });
    }

    const chat = await Conversation.findOne({ _id: conversationId, companyId: req.companyId })
      .select("phoneNumberId contact")
      .populate("contact", "phone");
    if (!chat) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    let phoneNumberId = chat.phoneNumberId;
    if (!phoneNumberId) {
      const company = await Company.findById(req.companyId).select("whatsapp").lean();
      phoneNumberId = primaryNumberId(company);
    }
    const credentials = await getCompanyWhatsAppCredentials(req.companyId, phoneNumberId || undefined);
    if (!credentials) {
      return res.status(400).json({
        success: false,
        message: "Connect a WhatsApp Business Account before sending messages",
      });
    }

    const metaResponse = await sendMediaMessage(credentials, chat.contact.phone, {
      filePath: req.file.path,
      mimeType: req.file.mimetype,
      fileName: req.file.originalname,
      caption: (caption || "").trim(),
    });

    const kind = mediaKindOf(req.file.mimetype);
    req.body.phone = chat.contact.phone;
    req.body.message = (caption || "").trim() || `${MEDIA_LABELS[kind]}${kind === "document" ? `: ${req.file.originalname}` : ""}`;
    req.body.sender = "agent";
    req.body.status = "sent";
    req.body.senderName = senderName;
    req.body.phoneNumberId = phoneNumberId;
    req.body.whatsappMessageId = metaResponse.messages?.[0]?.id;
    req.body.mediaUrl = req.file.path.replace(/\\/g, "/");
    req.body.mediaType = req.file.mimetype;

    await saveMessage(req, res);
  } catch (error) {
    console.log(error.response?.data || error.message);
    const metaError = error.response?.data?.error;
    res.status(502).json({
      success: false,
      message:
        metaError?.error_data?.details ||
        metaError?.message ||
        "WhatsApp didn't accept the file. Check its size and type and try again.",
      code: metaError?.code ? String(metaError.code) : undefined,
    });
  }
};

// An agent takes an unassigned chat for themselves.
const takeConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }
    if (conversation.assignedAgent && String(conversation.assignedAgent) !== String(req.user.userId)) {
      return res.status(409).json({ success: false, message: "Someone else is already handling this chat." });
    }

    conversation.assignedAgent = req.user.userId;
    conversation.assignedBy = req.user.userId;
    conversation.assignedAt = new Date();
    await conversation.save();

    const updatedConversation = await Conversation.findById(conversation._id)
      .populate("contact")
      .populate("assignedAgent", "_id name email");

    emitToCompany(req.companyId, "inbox", "conversation_assigned", {
      conversationId: String(conversation._id),
      assignedAgent: updatedConversation.assignedAgent,
      assignedBy: req.user.userId,
    });

    res.status(200).json({ success: true, conversation: updatedConversation });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Couldn't take this chat. Please try again." });
  }
};

const updateMessageStatus = async (req, res) => {
  try {
    const { phone, status, whatsappMessageId, failure } = req.body;
    const { companyId } = req;

    const lastMessage = await Message.findOne({
      companyId,
      whatsappMessageId,
    });

    if (!lastMessage) {
      // If this fires for a wamid we just sent, the stored whatsappMessageId
      // on the Message doc does not match what Meta is echoing back here —
      // check saveCampaignMessage / saveMessage for how it was stored.
      return res.status(200).json({
        success: true,
        message: "Ignored unknown message",
      });
    }

    if (lastMessage.status === status) {
      return res.status(200).json({
        success: true,
        message: "Already updated",
      });
    }

    if (shouldApplyStatusUpdate(lastMessage.status, status)) {
      lastMessage.status = status;

      if (status === "failed" && failure) {
        lastMessage.failure = failure;
      }

      await lastMessage.save();
    } else {
      console.log("Ignoring out-of-order or redundant status", {
        current: lastMessage.status,
        incoming: status,
      });

      return res.status(200).json({
        success: true,
        message: "Ignored older status",
      });
    }
    if (lastMessage.campaignId) {
      // Only delivered/read/failed arrive via this webhook path — sent and
      // send-time failures are stamped in campaignSenderService.js instead,
      // at the moment the send actually happens.
      const timestampField = WEBHOOK_STATUS_TIMESTAMP_FIELD[status];
      const setFields = {
        "contacts.$.status": status,
      };

      if (timestampField) {
        setFields[`contacts.$.${timestampField}`] = new Date();
      }

      if (status === "failed" && failure) {
        setFields["contacts.$.failure"] = failure;
      }

      await Campaign.updateOne(
        {
          _id: lastMessage.campaignId,
          companyId,
          "contacts.phone": phone,
        },
        {
          $set: setFields,
        },
      );
      const updatedCampaign = await recalculateCampaignStats(
        lastMessage.campaignId,
      );

      emitToCompany(companyId, "campaigns", "campaign_updated", updatedCampaign);
    }

    emitToCompany(companyId, "inbox", "message_status_updated", lastMessage);

    res.status(200).json({
      success: true,
      message: "Status updated",
    });
  } catch (error) {
    console.error("Update status error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const toggleConversationAi = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { aiEnabled } = req.body;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      companyId: req.companyId,
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    conversation.aiEnabled = aiEnabled;

    conversation.status = aiEnabled ? "AI_ACTIVE" : "HUMAN_PENDING";

    if (aiEnabled) {
      // Manual re-enable clears prior escalation state so an old low-
      // confidence/turn-limit trigger doesn't immediately re-fire.
      conversation.escalationReason = null;
      conversation.escalatedAt = null;
      conversation.aiTurnCount = 0;
    }

    await conversation.save();

    const updatedConversation =
      await Conversation.findById(conversationId).populate("contact");

    emitToCompany(updatedConversation?.companyId, "inbox", "conversation_updated", updatedConversation);

    res.status(200).json({
      success: true,
      conversation: updatedConversation,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Failed to toggle AI mode",
    });
  }
};

const getConversationByPhone = async (req, res) => {
  try {
    const { phone } = req.params;

    const result = await getConversationSettings(
      req.companyId,
      phone,
      req.query.phoneNumberId ? String(req.query.phoneNumberId) : "",
    );

    return res.status(200).json({
      aiEnabled: result.aiEnabled,
      status: result.status,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch conversation",
      error: error.message,
    });
  }
};

// Finds the latest chat with a phone number, for "Chat" buttons outside the
// inbox. 404 when there's no chat yet (the inbox then offers to start one).
const findConversationByPhone = async (req, res) => {
  try {
    const raw = String(req.query.phone || "").trim();
    // Old data can hold the same person twice (formatted and normalised
    // numbers), so look across every matching contact.
    const contacts = await Contact.find({
      companyId: req.companyId,
      phone: { $in: [...new Set([normalizePhone(raw), raw])] },
    }).select("_id name phone");
    const contact = contacts[0] || null;
    const conversation = contacts.length
      ? await Conversation.findOne({ companyId: req.companyId, contact: { $in: contacts.map((c) => c._id) } })
          .sort({ lastMessageTime: -1 })
          .populate("contact")
          .populate("assignedAgent", "_id name email")
      : null;
    if (!conversation) {
      return res.status(404).json({ success: false, contact, message: "No chat with this number yet" });
    }
    res.status(200).json({ success: true, conversation });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Couldn't look up this chat" });
  }
};

const updateContactTags = async (req, res) => {
  try {
    const { id } = req.params;
    const { tags } = req.body;

    const contact = await Contact.findOne({
      _id: id,
      companyId: req.companyId,
    });

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Contact not found",
      });
    }

    contact.tags = tags || [];

    await contact.save();

    const updatedConversation = await Conversation.findOne({
      companyId: req.companyId,
      contact: contact._id,
    }).populate("contact");

    if (updatedConversation) {
      emitToCompany(req.companyId, "inbox", "conversation_updated", updatedConversation);
    }

    res.status(200).json({
      success: true,
      contact,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Failed to update contact tags",
    });
  }
};

const updateContactConsent = async (req, res) => {
  try {
    const { id } = req.params;
    const { optedOut } = req.body;

    const contact = await Contact.findOne({
      _id: id,
      companyId: req.companyId,
    });

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Contact not found",
      });
    }

    contact.optedOut = Boolean(optedOut);
    contact.optedOutAt = contact.optedOut ? new Date() : null;

    await contact.save();

    const updatedConversation = await Conversation.findOne({
      companyId: req.companyId,
      contact: contact._id,
    }).populate("contact");

    if (updatedConversation) {
      emitToCompany(req.companyId, "inbox", "conversation_updated", updatedConversation);
    }

    res.status(200).json({
      success: true,
      contact,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Failed to update contact consent",
    });
  }
};

const assignConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const { agentId } = req.body;
    const { companyId } = req;

    const conversation = await Conversation.findOne({ _id: id, companyId });
    if (!conversation) {
      return res
        .status(404)
        .json({ success: false, message: "Conversation not found" });
    }

    // Unassign path — agentId null/undefined clears all assignment fields
    if (!agentId) {
      conversation.assignedAgent = null;
      conversation.assignedBy = null;
      conversation.assignedAt = null;
      await conversation.save();

      const updatedConversation =
        await Conversation.findById(id).populate("contact");

      emitToCompany(companyId, "inbox", "conversation_assigned", {
        conversationId: id,
        assignedAgent: null,
        assignedBy: null,
      });

      return res
        .status(200)
        .json({ success: true, conversation: updatedConversation });
    }

    // Scoped to the same company — otherwise Company A could assign one of
    // its conversations to a User document that happens to belong to
    // Company B.
    const agent = await User.findOne({ _id: agentId, companyId });
    if (!agent) {
      return res
        .status(404)
        .json({ success: false, message: "Agent not found" });
    }

    if (agent.role !== ROLES.SUPPORT_AGENT) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }

    conversation.assignedAgent = agentId;
    conversation.assignedBy = req.user.userId;
    conversation.assignedAt = new Date();
    await conversation.save();

    const updatedConversation = await Conversation.findById(id)
      .populate("contact")
      .populate("assignedAgent", "_id name email");

    emitToCompany(companyId, "inbox", "conversation_assigned", {
      conversationId: id,
      assignedAgent: updatedConversation.assignedAgent,
      assignedBy: req.user.userId,
    });

    return res
      .status(200)
      .json({ success: true, conversation: updatedConversation });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ success: false, message: "Failed to assign conversation" });
  }
};

module.exports = {
  saveMessage,
  getConversations,
  getMessagesbyConversation,
  getConversationByPhone,
  markConversationAsRead,
  sendMessage,
  sendTemplateInChat,
  sendMediaInChat,
  takeConversation,
  findConversationByPhone,
  updateMessageStatus,
  toggleConversationAi,
  updateContactTags,
  updateContactConsent,
  assignConversation,
};
