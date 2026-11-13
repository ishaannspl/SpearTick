# Manual testing guide — ease-of-use changes (October 2026)

Use a **test company** and **your own phone** for everything here. Never test campaigns on real customer lists.

## Before you start

1. **Restart the backend** (`BACKEND`): new routes and database fields were added, so a running server won't have them.
2. **Restart the frontend** (`FRONTEND`, `npm run dev`).
3. **Optional, for the Help button and "Forgot password?" contact links**: add these to `FRONTEND/.env`, then restart the frontend:
   ```
   VITE_SUPPORT_WHATSAPP=91XXXXXXXXXX
   VITE_SUPPORT_EMAIL=support@yourdomain.com
   ```
4. **Have ready:**
   - an admin login;
   - a team-member login (Support agent);
   - a second phone, or a friend's, with WhatsApp;
   - one CSV file of 3–5 test contacts. Use a column called **Mobile** (not "phone"), and write one number as `98765 43210`, one as `+91 98765-43211`, and one wrong number like `12345`.

When something doesn't match "Expected", note the page, what you clicked, and a screenshot.

---

## 1. Sign in and session

| # | Do this | Expected |
|---|---|---|
| 1.1 | On the sign-in page, click **Forgot password?** | Help text explains: team members ask their admin; account owners contact support (links appear if you set the support variables). |
| 1.2 | Sign in, open any page (e.g. Contacts), and leave the computer alone for 59 minutes | A "Still there? You'll be signed out in 1 minute" message appears. Moving the mouse removes it and you stay signed in. |
| 1.3 | Leave it for a full 60 minutes | You're signed out with a clear message. Sign in again and you **return to the same page**, not the dashboard. |

To test faster, temporarily change `IDLE_THRESHOLD_MS` in `FRONTEND/src/hooks/useSessionExpiry.js` to `2 * 60 * 1000` (2 minutes), then put it back afterwards.

## 2. WhatsApp setup (new company)

| # | Do this | Expected |
|---|---|---|
| 2.1 | Sign up a new test company, choose a plan, and reach the **Connect WhatsApp** page | The page header says "Last step: WhatsApp connection". |
| 2.2 | Below the green button, click **Meta window not working? Connect manually instead** | A form appears asking for 3 details: access token, Phone Number ID and WhatsApp Business Account ID. "Graph API version" is hidden under **Advanced settings**. |
| 2.3 | Paste valid details and click **Connect WhatsApp** | It connects, and the page moves on to the payment-method step. |
| 2.4 | If Meta's window links a business account that has **no phone number** | A yellow box explains how to add and verify a number. The page does **not** say "already connected". |

## 3. Dashboard "Get started" checklist

| # | Do this | Expected |
|---|---|---|
| 3.1 | Open the Dashboard as admin on a fresh company | A **Get started with WhatsApp** card shows 5 steps with a progress bar. Only the next step is highlighted, with one button. |
| 3.2 | Complete steps one by one: add contacts, get a template approved, send a test, send a campaign | Each step gets ticked. While a template is waiting for approval, the step shows a clock and "waiting for WhatsApp's approval". |
| 3.3 | Click **Hide for now** | The card disappears and stays hidden after a refresh. |
| 3.4 | Sign in as a Team lead | The checklist is not shown, because team leads can't send campaigns. |

## 4. Contacts

| # | Do this | Expected |
|---|---|---|
| 4.1 | Contacts → **Import** → before choosing a file, click **Download a sample file** | A small `contacts-sample.csv` downloads. |
| 4.2 | Import your test CSV with the **Mobile** column | It shows "N contacts ready to import", a warning for the wrong number, and "Phone numbers are read from the "Mobile" column". |
| 4.3 | Click **Import** | You get a plain summary (new contacts added / already in your contacts / skipped). Under it: "Row 4 (12345): Not a valid WhatsApp number". |
| 4.4 | Look at the imported numbers | All are stored as `91XXXXXXXXXX`. Importing the same file again adds **no duplicates**. |
| 4.5 | Import a CSV whose phone column has an unusual name, e.g. "Cust No" | A **Which column has the phone numbers?** picker appears. |
| 4.6 | Check the **Messages** column in the contacts table | It shows "Gets campaigns" (not "Opted in") or "Opted out since …". |
| 4.7 | Select a few contacts → **Delete** | A proper confirmation popup appears, not the browser's own box. Contacts with chat history are kept, with a message explaining why. |
| 4.8 | Delete a group | A confirmation popup says the contacts stay. |
| 4.9 | Click **Chat** on a contact who has never chatted | The Inbox opens the **Send a template** window, so you can start a chat with them. |

## 5. Templates

| # | Do this | Expected |
|---|---|---|
| 5.1 | Look at the sidebar | **Templates** is one item with no sub-menu. |
| 5.2 | Open Templates | One list with tabs: All · Ready to send · Waiting for WhatsApp · Needs changes · Drafts & plain, each with a count. Each row has **one** status in plain words. |
| 5.3 | Click **New template** | The page opens with **Start from a ready-made template** (10 cards). Picking one (e.g. Payment reminder) fills the type, name, message and examples, and jumps to step 2. |
| 5.4 | Type a message that starts with `{{name}}`, then click Next | An error explains it can't start with a blank. Try "ends with a blank" and "two blanks together" too. |
| 5.5 | Look at the preview while filling in examples | The preview shows your example values (e.g. "Hi Ravi"), not `{{name}}`. |
| 5.6 | Click **Save draft** half-way | You land on Templates → Drafts and the draft is listed. Open it again: the type, language and examples are kept. |
| 5.7 | Change something and click **Cancel** | "Leave without saving?" popup. |
| 5.8 | Type a message, then use **Draft with AI** | "Replace your message?" popup before it overwrites. |
| 5.9 | Send a template for approval | A toast says approval usually takes minutes to hours, and you land on the **Waiting for WhatsApp** tab. Clicking Send twice, or retrying after an error, does **not** create two copies. |
| 5.10 | When WhatsApp rejects one | It shows under **Needs changes** with a plain reason and a **Fix** button. The edit page shows a red box explaining why. |
| 5.11 | Edit an **approved** template | A yellow warning explains it must be approved again. **Save draft** is not offered (so campaigns never send old wording while the page shows new). Submitting asks for confirmation. |
| 5.12 | Click **Use** on a ready template | Create campaign opens with that template already chosen. |
| 5.13 | Click **Get latest from WhatsApp** | A toast says what was updated. No browser pop-ups. |
| 5.14 | Delete a template | Confirmation popup explaining it stays in Meta Business Suite. |
| 5.15 | At the bottom, click **Save a plain message** | A simple editor (name, message, optional image, preview) with a warning that plain messages only reach people who wrote in the last 24 hours. |
| 5.16 | Visit old links `/templates/approved` and `/templates/approved/approvals` | They redirect to the new Templates list (the second one opens the Needs changes tab). |

## 6. Create campaign (wizard)

| # | Do this | Expected |
|---|---|---|
| 6.1 | Open Create campaign | 4 steps across the top: Who gets it → Message → When → Review & send. |
| 6.2 | Step 1: upload your CSV, or pick a group | You see how many are ready or need attention. Wrong numbers can be fixed, or skipped with **skip them and continue**. **Continue** explains what's missing instead of doing nothing. |
| 6.3 | Step 2: **Approved template** is selected by default | Choosing a template with blanks fills them from your list's columns automatically. If you have no approved template, the page says so and links to create one. |
| 6.4 | Switch to **Plain message** | A warning says it only reaches people who messaged in the last 24 hours. Typing `{{amount}}` when your list has no Amount column shows a warning and blocks Continue. |
| 6.5 | **Send yourself a test** with your own number written as `98765 43210` | It arrives on your phone with the first contact's details filled in. The dashboard checklist ticks "Send yourself a test". |
| 6.6 | Step 3: pick **Schedule for later** | The time zone is shown. A time in the past is refused. On the Free plan, a link to see plans appears. |
| 6.7 | Step 4 (Review) | Shows the number of people, the template, when, the **approximate cost**, and that opted-out contacts are left out automatically. The campaign name is pre-filled and can be changed. |
| 6.8 | Click **Send to N people** | A confirmation popup with the count and cost. Click **Not yet** and nothing is sent. |
| 6.9 | Confirm | You're taken straight to the campaign's live progress page. |
| 6.10 | Campaign history → **Send again** on a template campaign | The wizard opens with the same contacts **and the same template**. |

## 7. Campaign report

| # | Do this | Expected |
|---|---|---|
| 7.1 | Send a template to a number that isn't on WhatsApp | The failed row shows "Failed" plus a plain reason (e.g. "This number can't receive WhatsApp messages…") and "WhatsApp code 131026". You don't need to hover. |
| 7.2 | Click **Retry failed** | A toast says how many will be retried and how many were skipped because retrying can't help. |

## 8. Inbox

You need a second phone that messages your business number.

| # | Do this | Expected |
|---|---|---|
| 8.1 | Open a chat where the customer wrote less than 24 hours ago | The header shows a green "Reply window: 23 h left". Under 2 hours left, it turns yellow. |
| 8.2 | Open a chat with no customer message in the last 24 hours | The header shows a red "Reply window closed". The message box is replaced by an explanation and a **Send a template** button. |
| 8.3 | Send a template from there | Pick a template; `{{name}}` is pre-filled with the contact's name; the preview updates; it is sent and appears in the chat. |
| 8.4 | Turn off your internet, then send a message | The message disappears, your text goes back into the box, and an error toast appears. It must **not** show a tick. |
| 8.5 | Send to a chat where WhatsApp rejects the message | Under the message: "Not sent" and a plain reason in red. |
| 8.6 | Click the 😊 button | An emoji picker opens and inserts the chosen emoji. |
| 8.7 | Click the paperclip, choose a photo (JPG/PNG) or PDF, type a caption, press Send | It arrives on the customer's phone and shows in the chat (photo inline, PDF as an "Open PDF" link). |
| 8.7b | Attach a file, then switch to another chat before sending | The attachment is cleared, so it can't go to the wrong customer. Opening **Send a template** in a second chat also starts empty. |
| 8.8 | From the customer phone, send a **photo**, a **voice note** and a **PDF** | They show in the chat as a photo, an audio player and a file link, not empty or broken. |
| 8.9 | Type `/` in the message box | The quick replies list opens. Click **Manage** (or **Add one**), add "timings" → "We're open 10 am–9 pm". Then type `/tim` and press Enter: the text is inserted. Another team member sees the same quick replies. |
| 8.10 | From the customer phone, write "I want to talk to a person" (with AI on) | Within seconds, a toast "<name> needs a reply from a person" appears with a chime. The chat shows "Needs a reply" in the list, and the **Needs reply** tab count goes up. |
| 8.11 | Reply to that chat as a person | It leaves the Needs reply tab. |
| 8.12 | As a **Support agent**, open an unassigned chat | A **Take this chat** button assigns it to you, and the list shows "With <your name>". |
| 8.13 | In the contact panel, click **Opt back in** on an opted-out customer | A warning popup explains the risk before anything changes. |
| 8.14 | Fresh company with no chats | The list says "No chats yet" and explains how chats arrive. |

## 9. Plans and billing

| # | Do this | Expected |
|---|---|---|
| 9.1 | On the Free plan, try to import contacts, schedule a campaign, or add a team member | One popup titled e.g. "This needs a higher plan", with plain wording (no "contactImport") and a **See plans** button (admins), or "Ask your admin" (others). |
| 9.2 | Billing page (setup complete) | A **Your usage** card shows bars for contacts, campaigns this month, templates and team members. |
| 9.3 | Billing FAQ "Is the Free Plan truly free" | It says unlimited campaigns, matching the plan table. |

## 10. Settings

| # | Do this | Expected |
|---|---|---|
| 10.1 | Settings sections | Team members · WhatsApp connection · Advanced (backup message prices, "usually not needed"). |
| 10.2 | WhatsApp connection | Shows your **phone number** and business name. The IDs are tucked under "Technical details (for support)". |
| 10.3 | Click **Disconnect** (test company only!) | A confirmation popup. After confirming, you land on the Connect WhatsApp page, and the sidebar no longer says "connected". |
| 10.4 | Add a team member | Each role shows a one-line description of what it can do. After saving, a toast reminds you to share the login details. |
| 10.5 | On a team member's row, click **New password** | Set a new password; that person can sign in with it. |
| 10.6 | Turn a member's access off and on | A toast confirms each change. An error shows a message, not nothing. |

## 11. Help

| # | Do this | Expected |
|---|---|---|
| 11.1 | With `VITE_SUPPORT_WHATSAPP` set | The sidebar shows **Help: chat with us on WhatsApp**, which opens WhatsApp with a prefilled message. Without the variable, the button is hidden. |

---

## If something goes wrong

- **Undo everything:** the original code from before all changes is saved at `C:\Users\Stunning\AppData\Local\Temp\claude\D--WhatsApp-Automation-WaGenius-main\da0cd550-4525-4910-a2e1-549f9c03cdf4\scratchpad\originals`. Copy its `FRONTEND\src` and `BACKEND\src` back to undo everything.
- **Undo only the second round (sections 3 and 5–11):** the state after the first round of fixes is in the `after-part1` folder next to it.
- **Copy the backups somewhere permanent:** that temp folder can be cleaned up by Windows. Better still, put the project in git.
