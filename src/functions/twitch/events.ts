import { EventEmitter } from "events";
import type { StreamOnlineEvent, ChannelUpdateEvent } from "./eventsub";

/**
 * In-process bus between the public webhook route and the bot functions.
 *
 * There is one callback URL for the whole application, but any number of bots
 * may be watching any number of channels, so the route cannot know which bot an
 * event belongs to. It publishes here keyed by broadcaster id, and each
 * function instance subscribes to the broadcaster it was configured with.
 */

export interface TwitchNotification {
  subscriptionType: string;
  broadcasterUserId: string;
  event: StreamOnlineEvent & ChannelUpdateEvent;
}

class TwitchEventBus extends EventEmitter {
  publish(notification: TwitchNotification): void {
    // Per-broadcaster channel, plus a firehose for logging and diagnostics.
    this.emit(`broadcaster:${notification.broadcasterUserId}`, notification);
    this.emit("notification", notification);
  }

  onBroadcaster(broadcasterUserId: string, handler: (n: TwitchNotification) => void): () => void {
    const key = `broadcaster:${broadcasterUserId}`;
    this.on(key, handler);
    return () => this.off(key, handler);
  }
}

export const twitchEvents = new TwitchEventBus();
// Many bots may watch the same popular channel; the default of 10 is low.
twitchEvents.setMaxListeners(100);
