import test from "node:test";
import assert from "node:assert/strict";
import { routeShipmentEvent } from "./exception_policy.ts";

test("an exception pauses automatic archive and goes to manual review", () => {
  assert.equal(routeShipmentEvent({ shipment_id: "S-42", event: "shipment.exception", exception: { code: "address_check", detail: "recipient moved" } }), "manual_review");
  assert.equal(routeShipmentEvent({ shipment_id: "S-43", event: "shipment.delivered", proof_of_delivery: { object_key: "pod/S-43.jpg", content_type: "image/jpeg" } }), "archive");
});
