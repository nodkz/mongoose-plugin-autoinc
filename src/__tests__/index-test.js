// @flow

import mongoose from 'mongoose';
import MongodbMemoryServer from 'mongodb-memory-server';
import { autoIncrement } from '..';

// May require additional time for downloading MongoDB binaries
jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;
mongoose.Promise = global.Promise;

let mongoServer;
let connection;
// const opts = { useMongoClient: true };

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
  // connection.on('error', (...args) => console.error(...args));
});

afterAll(() => {
  mongoose.disconnect();
  mongoServer.stop();
});

afterEach(async () => {
  if (connection.models.User) {
    await connection
      .model('User')
      .collection.drop()
      .catch(() => {});
    delete connection.models.User;
  }

  if (connection.models.IdentityCounter) {
    await connection
      .model('IdentityCounter')
      .collection.drop()
      .catch(() => {});
  }
});

describe('mongoose-auto-increment', () => {
  it('increment the _id field on validate', async () => {
    const UserSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });
    UserSchema.plugin(autoIncrement, 'User');
    const User = connection.model('User', UserSchema);
    await User.ensureIndexes();

    const user1 = new User({ name: 'Charlie', dept: 'Support' });
    const user2 = new User({ name: 'Charlene', dept: 'Marketing' });

    await user1.validate();
    await user2.validate();

    expect(user1._id).toBe(0);
    expect(user2._id).toBe(1);
  });

  it('increment the _id field on save', async () => {
    const UserSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });

    UserSchema.plugin(autoIncrement, 'User');
    const User = connection.model('User', UserSchema);
    await User.ensureIndexes();

    const user1 = new User({ name: 'Charlie', dept: 'Support' });
    const user2 = new User({ name: 'Charlene', dept: 'Marketing' });

    await user1.save();
    await user2.save();
    expect(user1._id).toBe(0);
    expect(user2._id).toBe(1);
  });

  it('increment the specified field instead', async () => {
    const UserSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });

    UserSchema.plugin(autoIncrement, { model: 'User', field: 'userId' });
    const User = connection.model('User', UserSchema);
    await User.ensureIndexes();

    const user1 = new User({ name: 'Charlie', dept: 'Support' });
    const user2 = new User({ name: 'Charlene', dept: 'Marketing' });

    await user1.save();
    await user2.save();

    expect(user1.userId).toBe(0);
    expect(user2.userId).toBe(1);
  });

  it('no duplicate key errors when creating docs in parallel', async () => {
    const UserSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });
    UserSchema.plugin(autoIncrement, { model: 'User', field: 'userId' });
    const User = connection.model('User', UserSchema);
    await User.ensureIndexes();

    const user1 = new User({ name: 'Charlie', dept: 'Support' });
    const user2 = new User({ name: 'Charlene', dept: 'Marketing' });
    const user3 = new User({ name: 'Parallel', dept: 'Something' });

    const users = [];
    users.push(user1.save());
    users.push(user2.save());
    users.push(user3.save());

    const results = await Promise.all(users);

    expect(results.length).toBe(3);
  });

  it('start counting at specified number', async () => {
    const UserSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });

    UserSchema.plugin(autoIncrement, { model: 'User', startAt: 3 });
    const User = connection.model('User', UserSchema);
    await User.ensureIndexes();

    const user1 = new User({ name: 'Charlie', dept: 'Support' });
    const user2 = new User({ name: 'Charlene', dept: 'Marketing' });

    await user1.save();
    await user2.save();

    expect(user1._id).toBe(3);
    expect(user2._id).toBe(4);
  });

  it('increment by the specified amount', async () => {
    const UserSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });
    UserSchema.plugin(autoIncrement, { model: 'User', incrementBy: 5 });
    const User = connection.model('User', UserSchema);
    await User.ensureIndexes();

    const user1 = new User({ name: 'Charlie', dept: 'Support' });
    const user2 = new User({ name: 'Charlene', dept: 'Marketing' });

    await user1.save();
    await user2.save();

    expect(() => {
      UserSchema.plugin(autoIncrement);
    }).toThrowError('model must be set');

    expect(user1._id).toBe(0);
    expect(user2._id).toBe(5);
  });

  describe('with incrementor groups', () => {
    it('increment the specified field within the groupingField instead', async () => {
      const UserSchema = new mongoose.Schema({
        name: String,
        dept: String,
      });
      UserSchema.plugin(autoIncrement, {
        model: 'User',
        field: 'userId',
        groupingField: 'dept',
      });
      const User = connection.model('User', UserSchema);
      await User.ensureIndexes();

      const user1 = new User({ name: 'Charlie', dept: 'Support' });
      const user2 = new User({ name: 'Charlene', dept: 'Marketing' });
      const user3 = new User({ name: 'John', dept: 'Support' });
      const user4 = new User({ name: 'John', dept: 'Marketing' });

      await user1.save();
      await user2.save();
      await user3.save();
      await user4.save();

      expect(user1.userId).toBe(0);
      expect(user2.userId).toBe(0);
      expect(user3.userId).toBe(1);
      expect(user4.userId).toBe(1);
    });

    it('should not allow grouping fields with _id as the field', async () => {
      const UserSchema = new mongoose.Schema({
        name: String,
        dept: String,
      });

      try {
        UserSchema.plugin(autoIncrement, {
          model: 'User',
          groupingField: 'dept',
        });
      } catch (err) {
        expect(err.message).toBe(
          'Cannot use a grouping field with _id, choose a different field name.'
        );
      }
    });
  });

  describe('nextCount() helper function', () => {
    it('nextCount should return the next count from document', async () => {
      const UserSchema = new mongoose.Schema({
        name: String,
        dept: String,
      });
      UserSchema.plugin(autoIncrement, 'User');
      const User = connection.model('User', UserSchema);
      await User.ensureIndexes();

      const user1 = new User({ name: 'Charlie', dept: 'Support' });
      const user2 = new User({ name: 'Charlene', dept: 'Marketing' });

      const count1 = await user1.nextCount();
      await user1.save();
      const count2 = await user1.nextCount();
      await user2.save();
      const count3 = await user2.nextCount();

      expect(count1).toBe(0);
      expect(user1._id).toBe(0);
      expect(count2).toBe(1);
      expect(user2._id).toBe(1);
      expect(count3).toBe(2);
    });

    it('nextCount should return the next count from model', async () => {
      const UserSchema = new mongoose.Schema({
        name: String,
        dept: String,
      });
      UserSchema.plugin(autoIncrement, 'User');
      const User = connection.model('User', UserSchema);
      await User.ensureIndexes();

      const user1 = new User({ name: 'Charlie', dept: 'Support' });
      const user2 = new User({ name: 'Charlene', dept: 'Marketing' });

      const count1 = await User.nextCount();
      await user1.save();
      const count2 = await User.nextCount();
      await user2.save();
      const count3 = await User.nextCount();

      expect(count1).toBe(0);
      expect(user1._id).toBe(0);
      expect(count2).toBe(1);
      expect(user2._id).toBe(1);
      expect(count3).toBe(2);
    });

    it('with incrementor groups return the next count', async () => {
      const UserSchema = new mongoose.Schema({
        name: String,
        dept: String,
      });
      UserSchema.plugin(autoIncrement, {
        model: 'User',
        field: 'userId',
        groupingField: 'dept',
      });
      const User = connection.model('User', UserSchema);
      await User.ensureIndexes();

      const user1 = new User({ name: 'Charlie', dept: 'Support' });
      const user2 = new User({ name: 'Charlene', dept: 'Marketing' });

      const count1 = await user1.nextCount();
      await user1.save();
      const count2 = await user1.nextCount(user1.dept);
      await user2.save();
      const count3 = await user2.nextCount(user2.dept);

      expect(count1).toBe(0);
      expect(user1.userId).toBe(0);
      expect(count2).toBe(1);
      expect(user2.userId).toBe(0);
      expect(count3).toBe(1);
    });
  });

  describe('resetCount() helper function', () => {
    it('should reset count via doc method', async () => {
      const UserSchema = new mongoose.Schema({
        name: String,
        dept: String,
      });
      UserSchema.plugin(autoIncrement, 'User');
      const User = connection.model('User', UserSchema);
      await User.ensureIndexes();

      const user = new User({ name: 'Charlie', dept: 'Support' });

      await user.save();
      const nextCount1 = await user.nextCount();
      const reset = await user.resetCount();
      const nextCount2 = await user.nextCount();

      expect(user._id).toBe(0);
      expect(nextCount1).toBe(1);
      expect(reset).toBe(0);
      expect(nextCount2).toBe(0);
    });

    it('should reset count via Model method', async () => {
      const UserSchema = new mongoose.Schema({
        name: String,
        dept: String,
      });
      UserSchema.plugin(autoIncrement, 'User');
      const User = connection.model('User', UserSchema);
      await User.ensureIndexes();

      const user = new User({ name: 'Charlie', dept: 'Support' });

      await user.save();
      const nextCount1 = await user.nextCount();
      const reset = await User.resetCount();
      const nextCount2 = await user.nextCount();

      expect(user._id).toBe(0);
      expect(nextCount1).toBe(1);
      expect(reset).toBe(0);
      expect(nextCount2).toBe(0);
    });
  });

  it('with string field and output filter increment the counter value only once', async () => {
    const UserSchema = new mongoose.Schema({
      orderNumber: Number,
      name: String,
      dept: String,
    });
    UserSchema.plugin(autoIncrement, {
      model: 'User',
      field: 'orderNumber',
      outputFilter: value => value * 100,
    });
    const User = connection.model('User', UserSchema);
    await User.ensureIndexes();

    const user1 = new User({ name: 'Charlie', dept: 'Support' });

    await user1.validate();
    const initialId = user1.orderNumber;
    await user1.validate();
    await user1.save();
    expect(user1.orderNumber).toBe(initialId);
  });

  it('should fix old counter record without `groupingField`', async () => {
    const _id = new mongoose.Types.ObjectId('100000000000000000000000');
    const icCollectoion = connection.collection('identitycounters');
    await icCollectoion.ensureIndex(
      {
        field: 1,
        groupingField: 1,
        model: 1,
      },
      {
        unique: true,
      }
    );
    await icCollectoion.insert({
      _id,
      model: 'User',
      field: 'orderNumber',
      count: 79,
    });

    expect(await icCollectoion.find().toArray()).toEqual([
      { _id, count: 79, field: 'orderNumber', model: 'User' },
    ]);

    const UserSchema = new mongoose.Schema({
      orderNumber: Number,
      name: String,
      dept: String,
    });
    UserSchema.plugin(autoIncrement, {
      model: 'User',
      field: 'orderNumber',
    });
    const User = connection.model('User', UserSchema);
    await User.ensureIndexes();

    const user1 = new User({ name: 'Charlie', dept: 'Support' });
    await user1.save();

    expect(await icCollectoion.find().toArray()).toEqual([
      { _id, count: 80, field: 'orderNumber', model: 'User', groupingField: '' },
    ]);
  });
});
