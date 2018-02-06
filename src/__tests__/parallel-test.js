// @flow

import mongoose from 'mongoose';
import MongodbMemoryServer from 'mongodb-memory-server';
import { autoIncrement } from '..';

// May require additional time for downloading MongoDB binaries
jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;
mongoose.Promise = global.Promise;

let mongoServer;
let connection;

beforeAll(async () => {
  mongoServer = new MongodbMemoryServer();
  const mongoUrl = await mongoServer.getConnectionString();

  connection = await mongoose
    .createConnection(mongoUrl, {
      autoReconnect: true,
      reconnectInterval: 100,
      reconnectTries: Number.MAX_VALUE,
    })
    // $FlowFixMe
    .catch(() => {});
  connection.on('error', (...args) => console.error(...args));
});

afterAll(() => {
  mongoose.disconnect();
  mongoServer.stop();
});

describe('parallel writing', () => {
  it('check that autoinc works correctly for _id', async () => {
    const runInParallel = 500;

    const UserSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });
    UserSchema.plugin(autoIncrement, 'User');
    const User = connection.model('User', UserSchema);

    async function createUserAsync() {
      return User.create({
        name: `Person ${Math.floor(Math.random() * 10000)}`,
        email: `mail+${Math.floor(Math.random() * 10000)}@pad.co.uk`,
      });
    }

    const p = [];
    for (let i = 0; i < runInParallel; i++) {
      p.push(createUserAsync());
    }
    expect(p.length).toBe(runInParallel);

    const docs = await Promise.all(p);

    const uniqIds = new Set();
    for (let i = 0; i < runInParallel; i++) {
      uniqIds.add(docs[i]._id.toString());
    }
    expect(uniqIds.size).toBe(runInParallel);
  });

  it('check that autoinc works correctly for customField', async () => {
    const runInParallel = 500;

    const UserPidSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });
    UserPidSchema.plugin(autoIncrement, { model: 'UserPid', field: 'pid' });
    const UserPid = connection.model('UserPid', UserPidSchema);

    async function createUserPidAsync() {
      return UserPid.create({
        name: `Person ${Math.floor(Math.random() * 10000)}`,
        email: `mail+${Math.floor(Math.random() * 10000)}@pad.co.uk`,
      });
    }

    const p = [];
    for (let i = 0; i < runInParallel; i++) {
      p.push(createUserPidAsync());
    }
    expect(p.length).toBe(runInParallel);

    const docs = await Promise.all(p);

    const uniqPids = new Set();
    for (let i = 0; i < runInParallel; i++) {
      uniqPids.add(docs[i].pid);
    }
    expect(uniqPids.size).toBe(runInParallel);
  });
});
