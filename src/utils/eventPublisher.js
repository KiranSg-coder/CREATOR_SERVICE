const axios = require("axios");
const crypto = require("crypto");

const EVENT_BUS_URL = (process.env.EVENT_BUS_URL || "http://localhost:6007").replace(
  /\/$/,
  "",
);
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY;

class EventPublisher {
  async publish(eventType, eventCategory, payload, metadata = {}) {
    try {
      const event = {
        eventType,
        eventCategory,
        sourceSystem: "CREATOR_SERVICE",
        userId: payload.userId || null,
        entityType: metadata.entityType || "CREATOR_APPLICATION",
        entityId: metadata.entityId || null,
        payload,
        metadata,
        correlationId: crypto.randomUUID(),
      };

      console.log(`[Creator EventPublisher] ${eventType}`);

      const response = await axios.post(`${EVENT_BUS_URL}/event/publish`, event, {
        headers: {
          "Content-Type": "application/json",
          "X-Service-Key": SERVICE_KEY,
        },
        timeout: 5000,
      });

      return response.data?.data;
    } catch (err) {
      console.error(`[Creator EventPublisher] ${eventType}:`, err.message);
      return null;
    }
  }
}

module.exports = new EventPublisher();
