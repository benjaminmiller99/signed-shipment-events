export type ShipmentEvent = {
  shipment_id: string;
  event: "shipment.delivered" | "shipment.exception";
  proof_of_delivery?: { object_key: string; content_type: string };
  exception?: { code: string; detail: string };
};

export function routeShipmentEvent(event: ShipmentEvent): "archive" | "manual_review" {
  return event.event === "shipment.exception" ? "manual_review" : "archive";
}
