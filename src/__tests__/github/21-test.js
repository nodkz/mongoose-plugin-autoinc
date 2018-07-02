/* @flow */
/* eslint-disable global-require */

import mongoose from 'mongoose';
import MongodbMemoryServer from 'mongodb-memory-server';

let mongoServer;
beforeAll(async () => {
  mongoServer = new MongodbMemoryServer();
  const mongoUrl = await mongoServer.getConnectionString();

  mongoose.connect(
    mongoUrl,
    {
      autoReconnect: true,
      reconnectInterval: 100,
      reconnectTries: Number.MAX_VALUE,
    }
  );
});
afterAll(() => {
  mongoose.disconnect();
  mongoServer.stop();
});

describe('issue #21', () => {
  it('call model.nextCount()', done => {
    const MySchema = new mongoose.Schema({
      name: { type: String },
      fruitId: Number,
    });

    const autoIncrement = require('../..');

    MySchema.plugin(autoIncrement.plugin, {
      model: 'fruit',
      field: 'fruitId',
    });

    const MyModel = mongoose.model('Fruit', MySchema);

    const a = new MyModel({
      name: 'stone',
    });

    a.save(err => {
      if (err) console.log('Error:', err);
      else {
        a.nextCount().then(count => {
          expect(count).toBe(1);
          done();
        });
      }
    });
  });
});
