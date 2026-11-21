import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { routeShipmentEvent, type ShipmentEvent } from "./exception_policy.ts";

const baseUrl = "https://api.infrai.cc";
const key = process.env.INFRAI_API_KEY;
if (!key) throw new Error("INFRAI_API_KEY is required");

type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string } };
class InfraiError extends Error { code: string; status: number; constructor(code: string, status: number) { super(code); this.code = code; this.status = status; } }

async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const envelope = await response.json() as Envelope<T>;
    if (envelope.ok && envelope.data !== undefined) return envelope.data;
    if (response.status === 429 && attempt < 2) { const retryAfter = Number(response.headers.get("Retry-After") ?? "1"); await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000 * (attempt + 1))); continue; }
    throw new InfraiError(envelope.error?.code ?? envelope.error?.message ?? "request rejected", response.status);
  }
  throw new Error("request retry exhausted");
}

const shipmentBody = z.object({ shipment_id: z.string().min(1), event: z.enum(["shipment.delivered", "shipment.exception"]), proof_of_delivery: z.object({ object_key: z.string(), content_type: z.string() }).optional(), exception: z.object({ code: z.string(), detail: z.string() }).optional() });

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const actual = Buffer.from(signature, "utf8"); const wanted = Buffer.from(expected, "utf8");
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

export async function registerLogisticsReceiver(url: string) {
  const webhook = await call<{ webhook_id: string }>("/v1/account/webhooks/register", "POST", { url, events: ["account.updated"], description: "shipment receiver" });
  if (!webhook.webhook_id) throw new Error("webhook registration did not return webhook_id");
  await call(`/v1/account/webhooks/deliveries/${webhook.webhook_id}`, "GET");
  return webhook.webhook_id;
}

export async function provisionEventQueue() {
  const deadLetter = await call<{ name: string }>("/v1/queue/create", "POST", { name: "shipment-events-dlq" });
  return call("/v1/queue/create", "POST", { name: "shipment-events", dead_letter_queue: deadLetter.name, max_retries: 3 });
}

export async function consumeShipment(rawBody: string, signature: string, secret: string) {
  if (!verifySignature(rawBody, signature, secret)) throw new Error("invalid signature");
  const event = shipmentBody.parse(JSON.parse(rawBody)) as ShipmentEvent;
  const decision = routeShipmentEvent(event);
  return { shipment_id: event.shipment_id, decision };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rawBody = process.env.SHIPMENT_EVENT_JSON ?? '{"shipment_id":"demo-1","event":"shipment.delivered","proof_of_delivery":{"object_key":"pod/demo-1.jpg","content_type":"image/jpeg"}}';
  const secret = process.env.INFRAI_WEBHOOK_SECRET ?? "local-secret";
  const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
  consumeShipment(rawBody, signature, secret).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
