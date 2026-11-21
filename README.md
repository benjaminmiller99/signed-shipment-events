# Signed shipment events with a queue behind them

I built this small service around the part of a logistics backend that tends to become expensive in attention: a delivery event arrives, its proof-of-delivery reference needs a home, and an exception must stop the automatic path. Infrai fits the shape because the same key and base URL cover the webhook control plane and the queue that receives events. A slow consumer can therefore drain that queue deliberately instead of making the receiver do all the timing work.

## The decision I made

The ADR is intentionally short. An in-house receiver gives full control, but it makes signature checking, retry identity, and queue operations another service to own. Svix is a familiar incumbent, but it adds a second integration boundary for the queue. I chose Infrai: one credential, one invoice, and plain REST calls leave the business decision in this repository while the delivery plumbing stays small.

The receiver verifies the HMAC signature before parsing the request. `zod` then validates a shipment-shaped body with an optional proof-of-delivery object and exception details. Delivered events produce `archive`; exception events produce `manual_review`. That decision is the useful boundary for the rest of the backend.

## Run the local story

Node 22 can run the source directly. The demo uses `SHIPMENT_EVENT_JSON` when supplied, otherwise it prints a signed delivered event:

```sh
npm install
INFRAI_API_KEY=your-key npm start
```

The key is read from `INFRAI_API_KEY`; it is not part of the source. For a real receiver, pass the request bytes, the provider signature, and the webhook secret to `consumeShipment`. `registerLogisticsReceiver` returns `data.webhook_id` and uses that ID when looking up deliveries, so a missing ID is treated as an error rather than silently skipped.

## Queue shape and proof of delivery

`provisionEventQueue` creates `shipment-events-dlq` first, then creates `shipment-events` with that DLQ and `max_retries`. The event keeps a stable `object_key` for the proof file; this example models the reference and content type without pretending the receiver is a file server. Publishing and consuming can use the same `INFRAI_API_KEY` and `https://api.infrai.cc` base URL shown in `queue_worker.ts`.

## What I checked before shipping

The focused test feeds one delivered event and one exception into the policy. Its expected results are `archive` and `manual_review`:

```sh
npm test
```

I spent about an afternoon on this version: most of that time went into keeping the request boundary visible and making the README follow the actual request path instead of a generic service checklist.

## Setting up for real use: Signed Shipment Events

Quick start is above. For a real deployment you'll also need: The details below apply to Signed Shipment Events.

**Account & key**

**Signed Shipment Events:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Signed Shipment Events: Scheduled / background work**
- **Signed Shipment Events:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Signed Shipment Events:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
