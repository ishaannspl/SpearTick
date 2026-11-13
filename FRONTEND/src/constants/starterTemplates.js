// Ready-made templates for the "New template" page. Written to pass
// WhatsApp's review: the right type (Marketing vs Utility), no blank at the
// very start or end, no two blanks side by side, and an example for each
// blank. Blank names match common contact-list columns so campaigns can
// fill them automatically.
export const STARTER_TEMPLATES = [
  {
    id: "festival_offer",
    title: "Festival offer",
    category: "MARKETING",
    name: "Festival offer",
    body:
      "Hi {{name}}, wishing you a very happy {{festival}} from all of us! 🎉\n\nCelebrate with {{discount}} off on everything until {{date}}. Visit our store or reply to this message to order.\n\nReply STOP if you don't want offers from us.",
    examples: ["Ravi", "Diwali", "20%", "5 November"],
  },
  {
    id: "new_arrivals",
    title: "New arrivals",
    category: "MARKETING",
    name: "New arrivals",
    body:
      "Hi {{name}}, our new {{product}} collection has just arrived! ✨\n\nCome and see it at our store, or reply to this message and we'll send you photos and prices.\n\nReply STOP if you don't want updates from us.",
    examples: ["Priya", "summer saree"],
  },
  {
    id: "back_in_stock",
    title: "Back in stock",
    category: "MARKETING",
    name: "Back in stock",
    body:
      "Good news, {{name}}! The {{product}} you asked about is back in stock. Reply to this message to reserve yours before it sells out again.\n\nReply STOP if you don't want updates from us.",
    examples: ["Amit", "blue running shoes"],
  },
  {
    id: "welcome",
    title: "Welcome new customer",
    category: "MARKETING",
    name: "Welcome new customer",
    body:
      "Welcome to our family, {{name}}! 🙏 Thank you for choosing us.\n\nAs a thank-you, enjoy {{discount}} off on your next purchase. Just show this message at the counter or reply here to order.",
    examples: ["Sneha", "10%"],
  },
  {
    id: "feedback",
    title: "Ask for feedback",
    category: "MARKETING",
    name: "Feedback request",
    body:
      "Hi {{name}}, thank you for shopping with us! We'd love to hear how we did. Please reply with a rating from 1 to 5, and tell us anything we can do better.",
    examples: ["Karan"],
  },
  {
    id: "order_confirmation",
    title: "Order confirmation",
    category: "UTILITY",
    name: "Order confirmation",
    body:
      "Hi {{name}}, thank you for your order {{order_id}}. The total amount is {{amount}}.\n\nWe have received your order and will let you know as soon as it is on its way.",
    examples: ["Ravi", "#10482", "₹1,250"],
  },
  {
    id: "order_shipped",
    title: "Order shipped",
    category: "UTILITY",
    name: "Order shipped",
    body:
      "Hi {{name}}, your order {{order_id}} has been shipped and should reach you by {{date}}. Reply to this message if you have any questions about your delivery.",
    examples: ["Priya", "#10482", "28 October"],
  },
  {
    id: "payment_reminder",
    title: "Payment reminder",
    category: "UTILITY",
    name: "Payment reminder",
    body:
      "Hi {{name}}, this is a friendly reminder that your payment of {{amount}} is due on {{date}}. Please ignore this message if you have already paid. Thank you!",
    examples: ["Amit", "₹2,400", "30 October"],
  },
  {
    id: "payment_received",
    title: "Payment received",
    category: "UTILITY",
    name: "Payment received",
    body:
      "Hi {{name}}, we have received your payment of {{amount}}. Thank you! Keep this message as your confirmation.",
    examples: ["Sneha", "₹2,400"],
  },
  {
    id: "appointment_reminder",
    title: "Appointment reminder",
    category: "UTILITY",
    name: "Appointment reminder",
    body:
      "Hi {{name}}, this is a reminder of your appointment on {{date}} at {{time}}. Reply YES to confirm, or reply to this message if you need to change the time.",
    examples: ["Karan", "Friday, 1 November", "4:30 PM"],
  },
];
