const BASE_URL = "https://automacao-zap.projetobrlatam.workers.dev/api";
const JWT_SECRET = "automacao-zap-jwt-secret-2026-x7k9m2p4q8r1";

function btoa(str) {
  return Buffer.from(str, "binary").toString("base64");
}

function encodeSegment(obj) {
  return btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// SHA256 HMAC helper using standard node crypto
const cryptoNode = require("crypto");
function signHS256(data, secret) {
  const signature = cryptoNode.createHmac("sha256", secret).update(data).digest("base64");
  return signature.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function createJWTLocally(payload, secret, expiresIn = "7d") {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 7 * 24 * 3600; // 7 days
  const fullPayload = { ...payload, iat: now, exp };

  const encodedHeader = encodeSegment(header);
  const encodedPayload = encodeSegment(fullPayload);
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = signHS256(data, secret);

  return `${data}.${signature}`;
}

async function test() {
  try {
    const payload = { sub: "57125ad1-29a9-4725-815f-e2608e506261", email: "rodineynb@gmail.com" };
    const token = createJWTLocally(payload, JWT_SECRET);
    console.log("Token gerado:", token);

    console.log("Buscando configurações de CRM...");
    const res = await fetch(`${BASE_URL}/crm/config/3805b688-0967-4e96-86da-6936c10c5d58`, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (!res.ok) {
      console.error("Erro ao buscar config:", await res.text());
      return;
    }

    const data = await res.json();
    console.log("Resposta da API:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Erro no teste:", err);
  }
}

test();
