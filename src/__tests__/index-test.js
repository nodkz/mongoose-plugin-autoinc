import async from 'async';
import mongoose from 'mongoose';
import MongodbMemoryServer from 'mongodb-memory-server';
import autoIncrement from '..';

let connection;

// May require additional time for downloading MongoDB binaries
jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;
mongoose.Promise = global.Promise;

let mongoServer;
const opts = { useMongoClient: true };

beforeAll(async () => {
  mongoServer = new MongodbMemoryServer();
  const mongoUri = await mongoServer.getConnectionString();
  mongoose.connect(mongoUri, opts, err => {
    // if (err) console.error(err); //eslint-disable-line
  });
  mongoose.connection.once('open', () => {
    autoIncrement.initialize(connection);
  });
});

afterAll(() => {
  mongoose.disconnect();
  mongoServer.stop();
});

// beforeAll(done => {
//   connection = mongoose.createConnection(process.env.MONGO_URL || 'mongodb://localhost/unit_test');
//   connection.on('error', console.error.bind(console));
//   connection.once('open', () => {
//     autoIncrement.initialize(connection);
//     done();
//   });
// });

// afterAll(done => {
//   connection.db.dropDatabase(err => {
//     if (err) return done(err);
//     connection.close(done);
//   });
// });

// afterEach(done => {
//   try {
//     connection.model('User').collection.drop(() => {
//       delete connection.models.User;
//       connection.model('IdentityCounter').collection.drop(done);
//     });
//   } catch (e) {
//     done();
//   }
// });

describe('mongoose-auto-increment', () => {
  it.only('should increment the _id field on validate', done => {
    // Arrange
    const userSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });
    userSchema.plugin(autoIncrement.plugin, 'User');
    const User = connection.model('User', userSchema);
    const user1 = new User({ name: 'Charlie', dept: 'Support' });
    const user2 = new User({ name: 'Charlene', dept: 'Marketing' });

    // Assert
    function assert(err) {
      // should.not.exist(err);

      // jest
      expect(err).toBeNull();
      expect(user1).toHaveProperty('_id', 0);
      expect(user2).toHaveProperty('_id', 1);

      // user1.should.have.property('_id', 0);
      // user2.should.have.property('_id', 1);
      done();
    }

    // Act
    async.series(
      {
        user1(cb) {
          user1.validate(cb);
        },
        user2(cb) {
          user2.validate(cb);
        },
      },
      assert,
    );
  });

  it('should increment the _id field on save', done => {
    // Arrange
    const userSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });

    userSchema.plugin(autoIncrement.plugin, 'User');
    const User = connection.model('User', userSchema);
    const user1 = new User({ name: 'Charlie', dept: 'Support' });
    const user2 = new User({ name: 'Charlene', dept: 'Marketing' });

    // Act
    async.series(
      {
        user1: cb => {
          user1.save(cb);
        },
        user2: cb => {
          user2.save(cb);
        },
      },
      assert,
    );

    // Assert
    function assert(err, results) {
      should.not.exist(err);
      // jest
      // expect(err).not.toBeNull();
      // expect(results.user1[0]).toHaveProperty('_id', 0);
      // expect(results.user2[0]).toHaveProperty('_id', 1);

      results.user1[0].should.have.property('_id', 0);
      results.user2[0].should.have.property('_id', 1);
      done();
    }
  });

  it('should increment the specified field instead (Test 2)', done => {
    // Arrange
    const userSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });

    userSchema.plugin(autoIncrement.plugin, { model: 'User', field: 'userId' });
    const User = connection.model('User', userSchema);
    const user1 = new User({ name: 'Charlie', dept: 'Support' });
    const user2 = new User({ name: 'Charlene', dept: 'Marketing' });

    // Act
    async.series(
      {
        user1: cb => {
          user1.save(cb);
        },
        user2: cb => {
          user2.save(cb);
        },
      },
      assert,
    );

    // Assert
    function assert(err, results) {
      should.not.exist(err);

      // jest
      // expect(err).not.toBeNull();
      // expect(results.user1[0].should).toHaveProperty('userId', 0)
      // expect(results.user2[0].should).toHaveProperty('userId', 1)

      results.user1[0].should.have.property('userId', 0);
      results.user2[0].should.have.property('userId', 1);
      done();
    }
  });

  it('should not throw duplicate key errors when creating counter docs while multiple documents in parallel', done => {
    // Arrange
    const userSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });

    userSchema.plugin(autoIncrement.plugin, { model: 'User', field: 'userId' });
    const User = connection.model('User', userSchema);

    const user1 = new User({ name: 'Charlie', dept: 'Support' });
    const user2 = new User({ name: 'Charlene', dept: 'Marketing' });
    const user3 = new User({ name: 'Parallel', dept: 'Something' });

    // Act
    Promise.all([user1.save(), user2.save(), user3.save()])
      .then(assert)
      .catch(done);

    // Assert
    function assert(results) {
      // jest
      // expect(results.length).toBe(3);

      results.length.should.equal(3);
      done();
    }
  });

  it('should start counting at specified number (Test 3)', done => {
    // Arrange

    const userSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });
    userSchema.plugin(autoIncrement.plugin, { model: 'User', startAt: 3 });
    let User = connection.model('User', userSchema),
      user1 = new User({ name: 'Charlie', dept: 'Support' }),
      user2 = new User({ name: 'Charlene', dept: 'Marketing' });

    // Act
    async.series(
      {
        user1: cb => {
          user1.save(cb);
        },
        user2: cb => {
          user2.save(cb);
        },
      },
      assert,
    );

    // Assert
    function assert(err, results) {
      should.not.exist(err);

      // jest
      // expect(err).not.toBeNull();
      // expect(results.user1).toHaveProperty('_id', 3)
      // expect(results.user2).toHaveProperty('_id', 4)

      results.user1[0].should.have.property('_id', 3);
      results.user2[0].should.have.property('_id', 4);
      done();
    }
  });

  it('should increment by the specified amount (Test 4)', done => {
    // Arrange
    const userSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });

    // jest
    // (expect(function() {
    //   userSchema.plugin(autoIncrement.plugin);
    // }).toThrow(Error));

    (function() {
      userSchema.plugin(autoIncrement.plugin);
    }.should.throw(Error));

    userSchema.plugin(autoIncrement.plugin, { model: 'User', incrementBy: 5 });
    const User = connection.model('User', userSchema);
    const user1 = new User({ name: 'Charlie', dept: 'Support' });
    const user2 = new User({ name: 'Charlene', dept: 'Marketing' });

    // Act
    async.series(
      {
        user1: cb => {
          user1.save(cb);
        },
        user2: cb => {
          user2.save(cb);
        },
      },
      assert,
    );

    // Assert
    function assert(err, results) {
      should.not.exist(err);

      // jest
      // expect(err).not.toBeNull();
      // expect(results.user1[0]).toHaveProperty('_id', 0);
      // expect(results.user2[0]).toHaveProperty('_id', 5);

      results.user1[0].should.have.property('_id', 0);
      results.user2[0].should.have.property('_id', 5);
      done();
    }
  });

  describe('with incrementor groups', () => {
    it('should increment the specified field within the groupingField instead', done => {
      // Arrange
      const userSchema = new mongoose.Schema({
        name: String,
        dept: String,
      });
      userSchema.plugin(autoIncrement.plugin, {
        model: 'User',
        field: 'userId',
        groupingField: 'dept',
      });
      const User = connection.model('User', userSchema);
      const user1 = new User({ name: 'Charlie', dept: 'Support' });
      const user2 = new User({ name: 'Charlene', dept: 'Marketing' });
      const user3 = new User({ name: 'John', dept: 'Support' });
      const user4 = new User({ name: 'John', dept: 'Marketing' });

      // Act
      async.series(
        {
          user1(cb) {
            user1.save(cb);
          },
          user2(cb) {
            user2.save(cb);
          },
          user3(cb) {
            user3.save(cb);
          },
          user4(cb) {
            user4.save(cb);
          },
        },
        assert,
      );

      // Assert
      function assert(err, results) {
        if (err) {
          done(err);
        } else {
          should.not.exist(err);

          // expect(err).toBeNull();
          // expect(results.user1[0]).toHaveProperty('userId', 0);
          // expect(results.user2[0]).toHaveProperty('userId', 0);
          // expect(results.user3[0]).toHaveProperty('userId', 1);
          // expect(results.user4[0]).toHaveProperty('userId', 1);

          results.user1[0].should.have.property('userId', 0);
          results.user2[0].should.have.property('userId', 0);
          results.user3[0].should.have.property('userId', 1);
          results.user4[0].should.have.property('userId', 1);
          done();
        }
      }
    });

    it('should not allow grouping fields with _id as the field', done => {
      // Arrange
      const userSchema = new mongoose.Schema({
        name: String,
        dept: String,
      });

      try {
        userSchema.plugin(autoIncrement.plugin, {
          model: 'User',
          groupingField: 'dept',
        });
      } catch (err) {
        err.message.should.equal(
          'Cannot use a grouping field with _id, choose a different field name.',
        );
        done();
      }
    });
  });

  describe('helper function', () => {
    it('nextCount should return the next count for the model and field (Test 5)', done => {
      // Arrange
      const userSchema = new mongoose.Schema({
        name: String,
        dept: String,
      });
      userSchema.plugin(autoIncrement.plugin, 'User');
      const User = connection.model('User', userSchema);
      const user1 = new User({ name: 'Charlie', dept: 'Support' });
      const user2 = new User({ name: 'Charlene', dept: 'Marketing' });

      // Act
      async.series(
        {
          count1(cb) {
            user1.nextCount(cb);
          },
          user1(cb) {
            user1.save(cb);
          },
          count2(cb) {
            user1.nextCount(cb);
          },
          user2(cb) {
            user2.save(cb);
          },
          count3(cb) {
            user2.nextCount(cb);
          },
        },
        assert,
      );

      // Assert
      function assert(err, results) {
        should.not.exist(err);

        // jest
        // expect(err).toBeNull();
        // expect(results.count1).toBe(0);
        // expect(results.user1[0]).toHaveProperty('_id', 0);
        // expect(results.count2).toBe(0);
        // expect(results.user2[0]).toHaveProperty('_id', 1);
        // expect(results.count3).toBe(0);

        results.count1.should.equal(0);
        results.user1[0].should.have.property('_id', 0);
        results.count2.should.equal(1);
        results.user2[0].should.have.property('_id', 1);
        results.count3.should.equal(2);
        done();
      }
    });

    it('resetCount should cause the count to reset as if there were no documents yet.', done => {
      // Arrange
      const userSchema = new mongoose.Schema({
        name: String,
        dept: String,
      });
      userSchema.plugin(autoIncrement.plugin, 'User');
      const User = connection.model('User', userSchema);
      const user = new User({ name: 'Charlie', dept: 'Support' });

      // Act
      async.series(
        {
          user(cb) {
            user.save(cb);
          },
          count1(cb) {
            user.nextCount(cb);
          },
          reset(cb) {
            user.resetCount(cb);
          },
          count2(cb) {
            user.nextCount(cb);
          },
        },
        assert,
      );

      // Assert
      function assert(err, results) {
        should.not.exist(err);

        // jest
        // expect(err).toBeNull();
        // expect(results.user[0]).toHaveProperty('_id', 0);
        // expect(results.count1).toBe(1);
        // expect(results.reset).toBe(0);
        // expect(results.count2).toBe(0);

        results.user[0].should.have.property('_id', 0);
        results.count1.should.equal(1);
        results.reset.should.equal(0);
        results.count2.should.equal(0);
        done();
      }
    });

    describe('with string field and output filter', () => {
      it('should increment the counter value, only once', done => {
        // Arrange
        const userSchema = new mongoose.Schema({
          orderNumber: String,
          name: String,
          dept: String,
        });
        userSchema.plugin(autoIncrement.plugin, {
          model: 'User',
          field: 'orderNumber',
          outputFilter(value) {
            return `R${value}`;
          },
        });
        const User = connection.model('User', userSchema);
        const user1 = new User({ name: 'Charlie', dept: 'Support' });

        let initialId;

        // Act
        user1
          .validate()
          .then(() => {
            initialId = user1.orderNumber;
            return user1.validate();
          })
          .then(() => {
            user1.save(assert);
          })
          .catch(done);

        // Assert
        function assert(err, result) {
          should.not.exist(err);

          // jest
          // expect(err).toBeNull();
          // expect(result).toHaveProperty('orderNumber', initialId);

          result.should.have.property('orderNumber', initialId);
          done();
        }
      });
    });

    describe('with incrementor groups', () => {
      it('nextCount should return the next count for the model, field, and groupingField', done => {
        // Arrange
        const userSchema = new mongoose.Schema({
          name: String,
          dept: String,
        });
        userSchema.plugin(autoIncrement.plugin, {
          model: 'User',
          field: 'userId',
          groupingField: 'dept',
        });
        const User = connection.model('User', userSchema);
        const user1 = new User({ name: 'Charlie', dept: 'Support' });
        const user2 = new User({ name: 'Charlene', dept: 'Marketing' });

        // Act
        async.series(
          {
            count1(cb) {
              user1.nextCount(user1.dept, cb);
            },
            user1(cb) {
              user1.save(cb);
            },
            count2(cb) {
              user1.nextCount(user1.dept, cb);
            },
            user2(cb) {
              user2.save(cb);
            },
            count3(cb) {
              user2.nextCount(user2.dept, cb);
            },
          },
          assert,
        );

        // Assert
        function assert(err, results) {
          if (err) {
            done(err);
          }
          should.not.exist(err);
          results.count1.should.equal(0);
          results.user1[0].should.have.property('userId', 0);
          results.count2.should.equal(1);
          results.user2[0].should.have.property('userId', 0);
          results.count3.should.equal(1);
          done();
        }
      });
    });
  });
});
