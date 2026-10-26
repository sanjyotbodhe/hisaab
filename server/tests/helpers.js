import './setup-env.js';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDb } from '../src/db.js';

let memory = null;

/** Uses TEST_MONGODB_URI if set, otherwise an in-memory MongoDB. */
export async function startDb() {
  let uri = process.env.TEST_MONGODB_URI;
  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memory = await MongoMemoryServer.create();
    uri = memory.getUri('hisaab-test');
  }
  await connectDb(uri);
  await mongoose.connection.db.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
}

export async function stopDb() {
  await mongoose.connection.db.dropDatabase().catch(() => {});
  await mongoose.disconnect();
  if (memory) await memory.stop();
}

export const app = createApp();

/** A logged-in client: keeps its cookie and sends the CSRF header. */
export function client() {
  const agent = request.agent(app);
  const withHeader = (r) => r.set('X-Requested-With', 'hisaab');
  return {
    agent,
    get: (url) => agent.get(url),
    post: (url, body) => withHeader(agent.post(url)).send(body ?? {}),
    put: (url, body) => withHeader(agent.put(url)).send(body ?? {}),
    patch: (url, body) => withHeader(agent.patch(url)).send(body ?? {}),
    del: (url) => withHeader(agent.delete(url)),
  };
}

let n = 0;
export async function newUser(name = 'User') {
  const c = client();
  n += 1;
  const email = `${name.toLowerCase().replace(/\s+/g, '')}${n}@example.com`;
  const res = await c.post('/api/auth/register', { name, email, password: 'password123' });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  c.user = res.body.user;
  c.email = email;
  return c;
}

/** Owner creates a group and everyone else joins with the invite code. */
export async function groupWith(owner, ...others) {
  const res = await owner.post('/api/groups', { name: 'Flat 302' });
  const group = res.body.group;
  for (const o of others) {
    const j = await o.post(`/api/invites/${group.inviteCode}/join`);
    if (j.status !== 200) throw new Error(`join failed ${j.status}`);
  }
  return group;
}

export const today = () => {
  // Same "today" rule as the server (IST).
  const d = new Date(Date.now() + 330 * 60 * 1000);
  return d.toISOString().slice(0, 10);
};
