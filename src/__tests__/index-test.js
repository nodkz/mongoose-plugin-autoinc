// @flow

import mongoose from 'mongoose';
import MongodbMemoryServer from 'mongodb-memory-server';
import { initialize, autoIncrement } from '..';

let connection;
// May require additional time for downloading MongoDB binaries
jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;
mongoose.Promise = global.Promise;

let mongoServer;
// const opts = { useMongoClient: true };

beforeAll(async () => {
  mongoServer = new MongodbMemoryServer();
  const mongoUrl = await mongoServer.getConnectionString();

  connection = mongoose.createConnection(mongoUrl);
  connection.on('error', (...args) => console.error(...args));
  await new Promise(resolve => {
    connection.once('open', () => {
      initialize(connection);
      resolve();
    });
  });
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
    // TODO: uncomment after code refactoring
    // delete connection.models.IdentityCounter;
  }
});

describe('mongoose-auto-increment', () => {
  it('increment the _id field on validate', async () => {
    const userSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });
    userSchema.plugin(autoIncrement, 'User');
    const User = connection.model('User', userSchema);
    await User.ensureIndexes();

    const user1 = new User({ name: 'Charlie', dept: 'Support' });
    const user2 = new User({ name: 'Charlene', dept: 'Marketing' });

    await user1.validate();
    await user2.validate();

    expect(user1._id).toBe(0);
    expect(user2._id).toBe(1);
  });

  it('increment the _id field on save', async () => {
    const userSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });

    userSchema.plugin(autoIncrement, 'User');
    const User = connection.model('User', userSchema);
    await User.ensureIndexes();

    const user1 = new User({ name: 'Charlie', dept: 'Support' });
    const user2 = new User({ name: 'Charlene', dept: 'Marketing' });

    await user1.save();
    await user2.save();
    expect(user1._id).toBe(0);
    expect(user2._id).toBe(1);
  });

  it('increment the specified field instead', async () => {
    const userSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });

    userSchema.plugin(autoIncrement, { model: 'User', field: 'userId' });
    const User = connection.model('User', userSchema);
    await User.ensureIndexes();

    const user1 = new User({ name: 'Charlie', dept: 'Support' });
    const user2 = new User({ name: 'Charlene', dept: 'Marketing' });

    await user1.save();
    await user2.save();

    expect(user1.userId).toBe(0);
    expect(user2.userId).toBe(1);
  });

  it('no duplicate key errors when creating docs in parallel', async () => {
    const userSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });
    userSchema.plugin(autoIncrement, { model: 'User', field: 'userId' });
    const User = connection.model('User', userSchema);
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
    const userSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });

    userSchema.plugin(autoIncrement, { model: 'User', startAt: 3 });
    const User = connection.model('User', userSchema);
    await User.ensureIndexes();

    const user1 = new User({ name: 'Charlie', dept: 'Support' });
    const user2 = new User({ name: 'Charlene', dept: 'Marketing' });

    await user1.save();
    await user2.save();

    expect(user1._id).toBe(3);
    expect(user2._id).toBe(4);
  });

  it('increment by the specified amount', async () => {
    const userSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });
    userSchema.plugin(autoIncrement, { model: 'User', incrementBy: 5 });
    const User = connection.model('User', userSchema);
    await User.ensureIndexes();

    const user1 = new User({ name: 'Charlie', dept: 'Support' });
    const user2 = new User({ name: 'Charlene', dept: 'Marketing' });

    await user1.save();
    await user2.save();

    // FIXME: wtf is this?
    expect(() => {
      userSchema.plugin(autoIncrement);
    }).toThrowError('model must be set');

    expect(user1._id).toBe(0);
    expect(user2._id).toBe(5);
  });

  describe('with incrementor groups', () => {
    it('increment the specified field within the groupingField instead', async () => {
      const userSchema = new mongoose.Schema({
        name: String,
        dept: String,
      });
      userSchema.plugin(autoIncrement, {
        model: 'User',
        field: 'userId',
        groupingField: 'dept',
      });
      const User = connection.model('User', userSchema);
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
      const userSchema = new mongoose.Schema({
        name: String,
        dept: String,
      });

      try {
        userSchema.plugin(autoIncrement, {
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

  describe('helper function', () => {
    it.skip('nextCount should return the next count for the model and field', async () => {
      const userSchema = new mongoose.Schema({
        name: String,
        dept: String,
      });
      userSchema.plugin(autoIncrement, 'User');
      const User = connection.model('User', userSchema);
      await User.ensureIndexes();

      const user1 = new User({ name: 'Charlie', dept: 'Support' });
      // const user2 = new User({ name: 'Charlene', dept: 'Marketing' });
      //
      // const spy = jest.fn(() => {});

      const count1 = user1.nextCount();
      // await user1.save();
      // const count2 = await user1.nextCount(spy);
      // const count3 = await user2.nextCount(spy);
      // await user2.save();

      expect(count1).toBe(0);
      // expect(user1._id).toBe(0);
      // expect(count2).toBe(1);
      // expect(user2._id).toBe(1);
      // expect(count3).toBe(2);
    });

    it.skip('resetCount should cause the count to reset as if there were no documents yet.', async () => {
      const userSchema = new mongoose.Schema({
        name: String,
        dept: String,
      });
      userSchema.plugin(autoIncrement, 'User');
      const User = connection.model('User', userSchema);
      await User.ensureIndexes();

      const user = new User({ name: 'Charlie', dept: 'Support' });

      const spy = jest.fn();

      await user.save();
      const count1 = await user.nextCount(spy);
      const reset = await user.resetCount();
      const count2 = await user.nextCount(spy);

      expect(user._id).toBe(0);
      expect(count1).toBe(1);
      expect(reset).toBe(0);
      expect(count2).toBe(0);
      // Act
      // async.series(
      //   {
      //     user(cb) {
      //       user.save(cb);
      //     },
      //     count1(cb) {
      //       user.nextCount(cb);
      //     },
      //     reset(cb) {
      //       user.resetCount(cb);
      //     },
      //     count2(cb) {
      //       user.nextCount(cb);
      //     },
      //   },
      //   assert
      // );
      //
      // // Assert
      // function assert(err, results) {
      //   should.not.exist(err);
      //
      //   // jest
      //   // expect(err).toBeNull();
      //   // expect(results.user[0]).toHaveProperty('_id', 0);
      //   // expect(results.count1).toBe(1);
      //   // expect(results.reset).toBe(0);
      //   // expect(results.count2).toBe(0);
      //
      //   results.user[0].should.have.property('_id', 0);
      //   results.count1.should.equal(1);
      //   results.reset.should.equal(0);
      //   results.count2.should.equal(0);
      //   done();
      // }
    });

    describe('with string field and output filter', () => {
      it('increment the counter value only once', async () => {
        const userSchema = new mongoose.Schema({
          orderNumber: String,
          name: String,
          dept: String,
        });
        userSchema.plugin(autoIncrement, {
          model: 'User',
          field: 'orderNumber',
          outputFilter(value) {
            return `R${value}`;
          },
        });
        const User = connection.model('User', userSchema);
        await User.ensureIndexes();

        const user1 = new User({ name: 'Charlie', dept: 'Support' });

        await user1.validate();
        const initialId = user1.orderNumber;
        await user1.validate();
        await user1.save();
        expect(user1.orderNumber).toBe(initialId);
      });
    });

    describe('with incrementor groups', () => {
      it.skip('return the next count for the model, field, and groupingField', async () => {
        const userSchema = new mongoose.Schema({
          name: String,
          dept: String,
        });
        userSchema.plugin(autoIncrement, {
          model: 'User',
          field: 'userId',
          groupingField: 'dept',
        });
        const User = connection.model('User', userSchema);
        await User.ensureIndexes();

        const user1 = new User({ name: 'Charlie', dept: 'Support' });
        // const user2 = new User({ name: 'Charlene', dept: 'Marketing' });
        //
        // const spy = jest.fn();

        // const count1 = await user1.nextCount(spy);
        // await user1.save();
        // const count2 = await user1.nextCount(user1.dept, spy);
        // await user2.save();
        // const count3 = await user2.nextCount(user2.dept, spy);

        // expect(count1).toBe(0);
        // expect(user1.userId).toBe(0);
        // expect(count2).toBe(1);
        // expect(user2.userId).toBe(0);
        // expect(count3).toBe(1);

        user1.nextCount((err1, count1) => {
          expect(count1).toBe(0);
          user1.save(() => {
            user1.nextCount((err2, count2) => {
              expect(count2).toBe(1);
            });
          });
        });

        // user2.save((err1, u) => {
        //   expect(u.userId).toBe(0);
        //   user2.nextCount((err, count) => {
        //     expect(count).toBe(1);
        //   });
        // });
      });
    });
  });
});
