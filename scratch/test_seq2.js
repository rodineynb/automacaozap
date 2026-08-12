const payload = {
  phone: "5522998513392",
  automationId: "3805b688-0967-4e96-86da-6936c10c5d58",
  conversationId: "79160014-6bf8-4f87-b63b-ce9ff0937211",
  whatsappApiId: "ee953336-7113-405b-95cf-825474587786",
  firstName: "Rodiney",
  step: 0
};

fetch('https://zapgo.promentor21.top/api/webhook/seq2-step', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload)
})
.then(async (res) => {
  console.log('Status:', res.status);
  console.log('Body:', await res.text());
})
.catch(err => {
  console.error('Error:', err);
});
