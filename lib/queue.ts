import { Queue } from "bullmq";
import { env } from "./config";

const redis = new URL(env.redisUrl);

export const redisConnection = {
  host: redis.hostname,
  port: Number(redis.port || 6379),
  username: redis.username || undefined,
  password: redis.password || undefined,
  db: redis.pathname.length > 1 ? Number(redis.pathname.slice(1)) : 0,
  tls: redis.protocol === "rediss:" ? {} : undefined,
  maxRetriesPerRequest: null,
};

let queue: Queue | undefined;
let transactionalQueue: Queue | undefined;
let dataQueue: Queue | undefined;

export function getEmailQueue() {
  queue ??= new Queue("serenity-email", {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 4,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 500,
      removeOnFail: 1000,
    },
  });
  return queue;
}

export function getTransactionalQueue() {
  transactionalQueue ??= new Queue("serenity-transactional", {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 1500 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
  return transactionalQueue;
}

export function getDataQueue() {
  dataQueue ??= new Queue("serenity-data", {
    connection: redisConnection,
    defaultJobOptions: { attempts: 2, backoff: { type: "exponential", delay: 3000 }, removeOnComplete: 200, removeOnFail: 1000 },
  });
  return dataQueue;
}
