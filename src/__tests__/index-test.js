var async = require('async'),
should = require('chai').should(),
mongoose = require('mongoose'),
autoIncrement = require('..'),
bases = require('bases'),
connection;

mongoose.Promise = global.Promise;

before(function (done) {
  connection = mongoose.createConnection(process.env.MONGO_URL || 'mongodb://localhost/unit_test');
  connection.on('error', console.error.bind(console));
  connection.once('open', function () {
    autoIncrement.initialize(connection);
    done();
  });
});

after(function (done) {
  connection.db.dropDatabase(function (err) {
    if (err) return done(err);
    connection.close(done);
  });
});

afterEach(function (done) {
  try {
    connection.model('User').collection.drop(function () {
      delete connection.models.User;
      connection.model('IdentityCounter').collection.drop(done);
    });
  } catch(e) {
    done();
  }
});

describe('mongoose-auto-increment', function () {
  it('should increment the _id field on validate', function(done) {
    // Arrange
    var userSchema = new mongoose.Schema({
      name: String,
      dept: String
    });
    userSchema.plugin(autoIncrement.plugin, 'User');
    var User = connection.model('User', userSchema),
    user1 = new User({ name: 'Charlie', dept: 'Support' }),
    user2 = new User({ name: 'Charlene', dept: 'Marketing' });

    // Act
    async.series({
      user1: function (cb) {
        user1.validate(cb);
      },
      user2: function (cb) {
        user2.validate(cb);
      }
    }, assert);

    // Assert
    function assert(err) {
      should.not.exist(err);
      user1.should.have.property('_id', 0);
      user2.should.have.property('_id', 1);
      done();
    }
  });

  it('should increment the _id field on save', function (done) {

    // Arrange
    var userSchema = new mongoose.Schema({
      name: String,
      dept: String
    });
    userSchema.plugin(autoIncrement.plugin, 'User');
    var User = connection.model('User', userSchema),
    user1 = new User({ name: 'Charlie', dept: 'Support' }),
    user2 = new User({ name: 'Charlene', dept: 'Marketing' });

    // Act
    async.series({
      user1: function (cb) {
        user1.save(cb);
      },
      user2: function (cb) {
        user2.save(cb);
      }
    }, assert);

    // Assert
    function assert(err, results) {
      should.not.exist(err);
      results.user1[0].should.have.property('_id', 0);
      results.user2[0].should.have.property('_id', 1);
      done();
    }

  });

  it('should increment the specified field instead (Test 2)', function(done) {

    // Arrange
    var userSchema = new mongoose.Schema({
      name: String,
      dept: String
    });
    userSchema.plugin(autoIncrement.plugin, { model: 'User', field: 'userId' });
    var User = connection.model('User', userSchema),
    user1 = new User({ name: 'Charlie', dept: 'Support' }),
    user2 = new User({ name: 'Charlene', dept: 'Marketing' });

    // Act
    async.series({
      user1: function (cb) {
        user1.save(cb);
      },
      user2: function (cb) {
        user2.save(cb);
      }
    }, assert);

    // Assert
    function assert(err, results) {
      should.not.exist(err);
      results.user1[0].should.have.property('userId', 0);
      results.user2[0].should.have.property('userId', 1);
      done();
    }

  });

  it('should not throw duplicate key errors when creating counter docs while multiple documents in parallel', function(done) {
      // Arrange
      var userSchema = new mongoose.Schema({
        name: String,
        dept: String
      });
      userSchema.plugin(autoIncrement.plugin, { model: 'User', field: 'userId' });
      var User = connection.model('User', userSchema);

      var user1 = new User({ name: 'Charlie', dept: 'Support' });
      var user2 = new User({ name: 'Charlene', dept: 'Marketing' });
      var user3 = new User({ name: 'Parallel', dept: 'Something' });

      // Act
      Promise.all([
          user1.save(),
          user2.save(),
          user3.save(),
      ]).then(assert).catch(done);

      // Assert
      function assert(results) {
        results.length.should.equal(3);
        done();
      }
  });

  it('should start counting at specified number (Test 3)', function (done) {

    // Arrange
    var userSchema = new mongoose.Schema({
      name: String,
      dept: String
    });
    userSchema.plugin(autoIncrement.plugin, { model: 'User', startAt: 3 });
    var User = connection.model('User', userSchema),
    user1 = new User({ name: 'Charlie', dept: 'Support' }),
    user2 = new User({ name: 'Charlene', dept: 'Marketing' });

    // Act
    async.series({
      user1: function (cb) {
        user1.save(cb);
      },
      user2: function (cb) {
        user2.save(cb);
      }
    }, assert);

    // Assert
    function assert(err, results) {
      should.not.exist(err);
      results.user1[0].should.have.property('_id', 3);
      results.user2[0].should.have.property('_id', 4);
      done();
    }

  });

  it('should increment by the specified amount (Test 4)', function (done) {

    // Arrange
    var userSchema = new mongoose.Schema({
      name: String,
      dept: String
    });

    (function() {
      userSchema.plugin(autoIncrement.plugin);
    }).should.throw(Error);

    userSchema.plugin(autoIncrement.plugin, { model: 'User', incrementBy: 5 });
    var User = connection.model('User', userSchema),
    user1 = new User({ name: 'Charlie', dept: 'Support' }),
    user2 = new User({ name: 'Charlene', dept: 'Marketing' });



    // Act
    async.series({
      user1: function (cb) {
        user1.save(cb);
      },
      user2: function (cb) {
        user2.save(cb);
      }
    }, assert);


    // Assert
    function assert(err, results) {
      should.not.exist(err);
      results.user1[0].should.have.property('_id', 0);
      results.user2[0].should.have.property('_id', 5);
      done();
    }

  });

  describe('with incrementor groups', function () {
    it('should increment the specified field within the groupingField instead', function(done) {

      // Arrange
      var userSchema = new mongoose.Schema({
        name: String,
        dept: String
      });
      userSchema.plugin(autoIncrement.plugin, { model: 'User', field: 'userId', groupingField: 'dept' });
      var User = connection.model('User', userSchema),
      user1 = new User({ name: 'Charlie', dept: 'Support' }),
      user2 = new User({ name: 'Charlene', dept: 'Marketing' }),
      user3 = new User({ name: 'John', dept: 'Support' }),
      user4 = new User({ name: 'John', dept: 'Marketing' });

      // Act
      async.series({
        user1: function (cb) {
          user1.save(cb);
        },
        user2: function (cb) {
          user2.save(cb);
        },
        user3: function (cb) {
          user3.save(cb);
        },
        user4: function (cb) {
          user4.save(cb);
        }
      }, assert);

      // Assert
      function assert(err, results) {
        if (err) {
          done(err);
        } else {
          should.not.exist(err);
          results.user1[0].should.have.property('userId', 0);
          results.user2[0].should.have.property('userId', 0);
          results.user3[0].should.have.property('userId', 1);
          results.user4[0].should.have.property('userId', 1);
          done();
        }
      }

    });

    it('should not allow grouping fields with _id as the field', function(done) {
      // Arrange
      var userSchema = new mongoose.Schema({
        name: String,
        dept: String
      });

      try {
        userSchema.plugin(autoIncrement.plugin, { model: 'User', groupingField: 'dept' });
      } catch (err) {
        err.message.should.equal('Cannot use a grouping field with _id, choose a different field name.');
        done();
      }
    });
  });

  describe('helper function', function () {

    it('nextCount should return the next count for the model and field (Test 5)', function (done) {

      // Arrange
      var userSchema = new mongoose.Schema({
        name: String,
        dept: String
      });
      userSchema.plugin(autoIncrement.plugin, 'User');
      var User = connection.model('User', userSchema),
      user1 = new User({ name: 'Charlie', dept: 'Support' }),
      user2 = new User({ name: 'Charlene', dept: 'Marketing' });;

      // Act
      async.series({
        count1: function (cb) {
          user1.nextCount(cb);
        },
        user1: function (cb) {
          user1.save(cb);
        },
        count2: function (cb) {
          user1.nextCount(cb);
        },
        user2: function (cb) {
          user2.save(cb);
        },
        count3: function (cb) {
          user2.nextCount(cb);
        }
      }, assert);

      // Assert
      function assert(err, results) {
        should.not.exist(err);
        results.count1.should.equal(0);
        results.user1[0].should.have.property('_id', 0);
        results.count2.should.equal(1);
        results.user2[0].should.have.property('_id', 1);
        results.count3.should.equal(2);
        done();
      }

    });

    it('resetCount should cause the count to reset as if there were no documents yet.', function (done) {

      // Arrange
      var userSchema = new mongoose.Schema({
        name: String,
        dept: String
      });
      userSchema.plugin(autoIncrement.plugin, 'User');
      var User = connection.model('User', userSchema),
      user = new User({name: 'Charlie', dept: 'Support'});

      // Act
      async.series({
        user: function (cb) {
          user.save(cb);
        },
        count1: function (cb) {
          user.nextCount(cb);
        },
        reset: function (cb) {
          user.resetCount(cb);
        },
        count2: function (cb) {
          user.nextCount(cb);
        }
      }, assert);

      // Assert
      function assert(err, results) {
        should.not.exist(err);
        results.user[0].should.have.property('_id', 0);
        results.count1.should.equal(1);
        results.reset.should.equal(0);
        results.count2.should.equal(0);
        done();
      }

    });

    describe('with string field and output filter', function() {
      it('should increment the counter value, only once', function(done) {
        // Arrange
        var userSchema = new mongoose.Schema({
          orderNumber: String,
          name: String,
          dept: String
        });
        userSchema.plugin(autoIncrement.plugin, {
          model: 'User',
          field: 'orderNumber',
          outputFilter: function(value) {
            return 'R' + value;
          }
        });
        var User = connection.model('User', userSchema),
        user1 = new User({ name: 'Charlie', dept: 'Support' });

        var initialId;

        // Act
        user1.validate().then(function() {
          initialId = user1.orderNumber;
          return user1.validate();
        }).then(function() {
          user1.save(assert);
        }).catch(done);

        // Assert
        function assert(err, result) {
          should.not.exist(err);
          result.should.have.property('orderNumber', initialId);
          done();
        }
      });
    });

    describe('with incrementor groups', function() {
      it('nextCount should return the next count for the model, field, and groupingField', function (done) {

      // Arrange
      var userSchema = new mongoose.Schema({
        name: String,
        dept: String
      });
      userSchema.plugin(autoIncrement.plugin, { model: 'User', field: 'userId', groupingField: 'dept' });
      var User = connection.model('User', userSchema),
      user1 = new User({ name: 'Charlie', dept: 'Support' }),
      user2 = new User({ name: 'Charlene', dept: 'Marketing' });

      // Act
      async.series({
        count1: function (cb) {
          user1.nextCount(user1.dept, cb);
        },
        user1: function (cb) {
          user1.save(cb);
        },
        count2: function (cb) {
          user1.nextCount(user1.dept, cb);
        },
        user2: function (cb) {
          user2.save(cb);
        },
        count3: function (cb) {
          user2.nextCount(user2.dept, cb);
        }
      }, assert);

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
