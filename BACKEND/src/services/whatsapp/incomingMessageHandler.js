const { saveMessage } = require("../../controllers/messageController");
const { createMockResponse } = require("../../utils/mockExpress");
const { getConversationSettings } = require("./conversationService");
const { executeAIWorkflow } = require("../ai/aiWorkflow");
const { applyConsentIntent } = require("./consentService");
const { getCompanyWhatsAppCredentials } = require("./companyCredentials");
const { downloadIncomingMedia } = require("./metaMediaService");

const MEDIA_LABELS = {
  image: "📷 Photo",
  video: "🎬 Video",
  audio: "🎤 Voice message",
  document: "📄 Document",
  sticker: "Sticker",
};

// The readable text of any incoming message: typed text, a tapped button,
// or a media caption.
const textOf = (message) =>
  message.text?.body ||
  message.button?.text ||
  message.interactive?.button_reply?.title ||
  message.interactive?.list_reply?.title ||
  message[message.type]?.caption ||
  "";

const {
  AI_TURN_LIMIT,
  detectExplicitEscalationRequest,
  detectLowConfidenceReply,
  escalateConversation,
} = require("../ai/escalationService");

const Conversation = require("../../models/conversation");
const Subscription = require("../../models/subscription");


const handleIncomingMessage = async (
  companyId,
  message,
  metadata
) => {
  try {

    /*
    ============================================
    1. SAVE INCOMING USER MESSAGE
    ============================================
    */

    // The company number this customer wrote to (from Meta's signed
    // payload). The whole exchange - saved chat, AI reply - stays on it.
    const phoneNumberId = metadata?.phone_number_id || "";

    // Photos, videos, voice notes and documents are saved so the inbox can
    // show them. A failed download still saves the message as a label.
    let media = null;
    const mediaPart = MEDIA_LABELS[message.type] ? message[message.type] : null;
    if (mediaPart?.id) {
      try {
        const credentials = await getCompanyWhatsAppCredentials(companyId, phoneNumberId || undefined);
        if (credentials) media = await downloadIncomingMedia(credentials, mediaPart.id);
      } catch (error) {
        console.error("Incoming media download failed:", error.response?.data || error.message);
      }
    }
    const shownText =
      textOf(message) ||
      (MEDIA_LABELS[message.type]
        ? `${MEDIA_LABELS[message.type]}${message.document?.filename ? `: ${message.document.filename}` : ""}`
        : "");

    const req = {
      companyId,
      body: {
        phoneNumberId,
        phone: message.from,
        message: shownText,
        sender: "user",
        mediaUrl: media?.mediaUrl || "",
        mediaType: media?.mediaType || "",
        name: metadata?.profile?.name || message.from,
        status: "received",
        whatsappMessageId: message.id,
      },
    };

    const res = createMockResponse();

    await saveMessage(req, res);

    const incomingText = textOf(message);


    /*
    ============================================
    2. DEBUG INFORMATION
    ============================================
    */

    console.log(
      "\n========== INCOMING AI DEBUG =========="
    );

    console.log(
      "Company ID:",
      companyId
    );

    console.log(
      "From:",
      message.from
    );

    console.log(
      "Message:",
      incomingText
    );


    /*
    ============================================
    3. CHECK OPT-OUT INTENT FIRST
    ============================================
    */

    const consentIntent =
      await applyConsentIntent(
        companyId,
        message.from,
        incomingText
      );

    console.log(
      "Consent Intent:",
      consentIntent
    );


    if (consentIntent === "opt_out") {

      console.log(
        "❌ AI STOPPED: Contact opted out."
      );

      console.log(
        "=======================================\n"
      );

      return res.getData();
    }


    /*
    ============================================
    4. GET CONVERSATION SETTINGS
    ============================================
    */

    const conversationSettings =
      await getConversationSettings(
        companyId,
        message.from,
        phoneNumberId
      );


    console.log(
      "AI Enabled:",
      conversationSettings.aiEnabled
    );

    console.log(
      "Conversation Status:",
      conversationSettings.status
    );

    console.log(
      "Contact Opted Out:",
      conversationSettings.contact?.optedOut
    );

    console.log(
      "Conversation ID:",
      conversationSettings.conversation?._id
    );

    console.log(
      "AI Turn Count:",
      conversationSettings.conversation?.aiTurnCount
    );


    /*
    ============================================
    5. CHECK EXISTING OPT-OUT
    ============================================
    */

    if (
      conversationSettings.contact?.optedOut
    ) {

      console.log(
        "❌ AI STOPPED: Contact is already opted out."
      );

      console.log(
        "=======================================\n"
      );

      return res.getData();
    }


    /*
    ============================================
    6. CHECK AI ENABLED
    ============================================
    */

    if (
      !conversationSettings.aiEnabled
    ) {

      console.log(
        "❌ AI STOPPED: AI is disabled for this conversation."
      );

      console.log(
        "=======================================\n"
      );

      return res.getData();
    }


    /*
    ============================================
    7. CHECK SUBSCRIPTION FEATURE
    ============================================
    */

    const subscription =
      await Subscription
        .findOne({ companyId })
        .populate("planId");


    if (
      !subscription ||
      !subscription.planId?.features?.ai ||
      [
        "SUSPENDED",
        "EXPIRED",
        "CANCELLED",
      ].includes(subscription.status)
    ) {

      console.log(
        "❌ AI STOPPED: AI is not available for this subscription."
      );

      console.log(
        "Subscription Found:",
        !!subscription
      );

      console.log(
        "Subscription Status:",
        subscription?.status
      );

      console.log(
        "Plan AI Feature:",
        subscription?.planId?.features?.ai
      );

      console.log(
        "=======================================\n"
      );

      return res.getData();
    }


    /*
    ============================================
    8. CHECK HUMAN ESCALATION
    ============================================
    */

    console.log(
      "🔎 Checking explicit human escalation..."
    );


    const explicitEscalation =
      detectExplicitEscalationRequest(
        incomingText
      );


    console.log(
      "Explicit Escalation Detected:",
      explicitEscalation
    );


    if (explicitEscalation) {

      console.log(
        "❌ AI STOPPED: Customer requested human escalation."
      );


      await escalateConversation(
        conversationSettings.conversation._id,
        "customer_request"
      );


      console.log(
        "Conversation switched to human mode."
      );


      console.log(
        "=======================================\n"
      );

      return res.getData();
    }


    console.log(
      "✅ No human escalation detected. Continuing AI workflow."
    );


    /*
    ============================================
    9. GET WHATSAPP CREDENTIALS
    ============================================
    */

    console.log(
      "🔐 Getting company WhatsApp credentials..."
    );


    const credentials =
      await getCompanyWhatsAppCredentials(
        companyId,
        phoneNumberId || undefined
      );


    console.log(
      "WhatsApp Credentials Found:",
      !!credentials
    );


    console.log(
      "Phone Number ID:",
      credentials?.phoneNumberId || "MISSING"
    );


    console.log(
      "Access Token Available:",
      !!credentials?.accessToken
    );


    if (!credentials) {

      console.error(
        `❌ Company ${companyId} has no connected WhatsApp account.`
      );

      console.log(
        "=======================================\n"
      );

      return res.getData();
    }


    /*
    ============================================
    10. EXECUTE AI WORKFLOW
    ============================================
    */

    try {

      console.log(
        "🤖 Starting AI workflow..."
      );


      const result =
        await executeAIWorkflow(
          credentials,
          message,
          { companyId }
        );


      console.log(
        "🤖 AI Workflow Result:",
        result
      );


      console.log(
        "AI Reply:",
        result?.aiReply
      );


      console.log(
        "WhatsApp Message ID:",
        result?.whatsappMessageId
      );


      /*
      ============================================
      11. SAVE AI MESSAGE
      ============================================
      */

      const aiReq = {
        companyId,
        body: {
          phoneNumberId: credentials.phoneNumberId,
          phone: message.from,
          message: result.aiReply,
          sender: "ai",
          status: result.status,
          whatsappMessageId:
            result.whatsappMessageId,
          senderName:
            "AI Assistant",
        },
      };


      const aiRes =
        createMockResponse();


      await saveMessage(
        aiReq,
        aiRes
      );


      console.log(
        "✅ AI reply saved successfully."
      );


      /*
      ============================================
      12. INCREMENT AI TURN COUNT
      ============================================
      */

      const updatedConversation =
        await Conversation.findByIdAndUpdate(
          conversationSettings.conversation._id,
          {
            $inc: {
              aiTurnCount: 1,
            },
          },
          {
            new: true,
          }
        );


      console.log(
        "AI Turn Count After Update:",
        updatedConversation?.aiTurnCount
      );


      /*
      ============================================
      13. LOW CONFIDENCE ESCALATION
      ============================================
      */

      if (
        detectLowConfidenceReply(
          result.aiReply
        )
      ) {

        console.log(
          "⚠️ Escalating due to low confidence."
        );


        await escalateConversation(
          updatedConversation._id,
          "low_confidence"
        );

      } else if (
        updatedConversation.aiTurnCount >=
        AI_TURN_LIMIT
      ) {

        console.log(
          "⚠️ Escalating due to AI turn limit."
        );


        await escalateConversation(
          updatedConversation._id,
          "turn_limit"
        );
      }


      console.log(
        "========== AI FLOW COMPLETED ==========\n"
      );


    } catch (aiError) {

      console.error(
        "\n❌ AI WORKFLOW ERROR"
      );

      console.error(
        "Message:",
        aiError.message
      );

      console.error(
        "Response:",
        aiError.response?.data ||
          "No API response"
      );

      console.error(
        "Stack:",
        aiError.stack
      );

      console.log(
        "=======================================\n"
      );
    }


    /*
    ============================================
    IMPORTANT:
    DO NOT THROW AI ERRORS TO META WEBHOOK.
    THE USER MESSAGE IS ALREADY SAVED.
    ============================================
    */

    return res.getData();


  } catch (error) {

    console.error(
      "Incoming Message Handler Error:",
      error
    );

    throw error;
  }
};


module.exports = {
  handleIncomingMessage,
};