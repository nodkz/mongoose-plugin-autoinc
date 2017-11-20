/* eslint-disable prefer-rest-params */

const mongoose = require('mongoose');
const _ = require('lodash');

let IdentityCounter;

const counterSchema = new mongoose.Schema({
  model: { type: String, required: true },
  field: { type: String, required: true },
  groupingField: { type: String, default: '' },
  count: { type: Number, default: 0 },
});

counterSchema.index(
  {
    field: 1,
    groupingField: 1,
    model: 1,
  },
  {
    unique: true,
  }
);

// Initialize plugin by creating counter collection in database.
exports.initialize = function initialize(connection) {
  try {
    IdentityCounter = connection.model('IdentityCounter');
  } catch (ex) {
    if (ex.name === 'MissingSchemaError') {
      // Create model using new schema.
      IdentityCounter = connection.model('IdentityCounter', counterSchema);
    } else {
      throw ex;
    }
  }
};

// The function to use when invoking the plugin on a custom schema.
exports.plugin = function plugin(schema, options) {
  const compoundIndex = {};
  const fields = {}; // A hash of fields to add properties to in Mongoose.

  // Default settings and plugin scope variables.
  const settings = {
    migrate: false, // If this is to be run on a migration for existing records. Only set this on migration processes.
    model: null, // The model to configure the plugin for.
    field: '_id', // The field the plugin should track.
    groupingField: '', // The field by which to group documents, allowing for each grouping to be incremented separately.
    startAt: 0, // The number the count should start at.
    incrementBy: 1, // The number by which to increment the count each time.
    unique: true, // Should we create a unique index for the field,
    outputFilter: undefined, // function that modifies the output of the counter.
  };

  // If we don't have reference to the counterSchema or the IdentityCounter model then the plugin was most likely not
  // initialized properly so throw an error.
  if (!counterSchema || !IdentityCounter) {
    throw new Error('mongoose-auto-increment has not been initialized');
  }

  switch (typeof options) {
    // If string, the user chose to pass in just the model name.
    case 'string':
      settings.model = options;
      break;
    // If object, the user passed in a hash of options.
    case 'object':
      _.assign(settings, options);
      break;
  }

  if (typeof settings.model !== 'string') {
    throw new Error('model must be set');
  }

  if (settings.field === '_id') {
    if (settings.groupingField.length) {
      throw new Error('Cannot use a grouping field with _id, choose a different field name.');
    }
  }

  if (!schema.path(settings.field) || settings.field === '_id') {
    schema.add(_.set({}, settings.field, { type: Number }));
  }

  // If a groupingField is specified, create a compound unique index.
  if (settings.groupingField.length) {
    compoundIndex[settings.field] = 1;
    compoundIndex[settings.groupingField] = 1;
    schema.index(compoundIndex, { unique: settings.unique });

    // Otherwise, add the unique index directly to the custom field.
  } else {
    // Add properties for field in schema.
    schema.path(settings.field).index({ unique: settings.unique });
  }

  // Add nextCount as both a method on documents and a static on the schema for convenience.
  schema.method('nextCount', nextCount);
  schema.static('nextCount', nextCount);

  // Add resetCount as both a method on documents and a static on the schema for convenience.
  schema.method('resetCount', resetCount);
  schema.static('resetCount', resetCount);

  // Every time documents in this schema are saved, run this logic.
  schema.pre('validate', function(next) {
    // Get reference to the document being saved.
    const doc = this;
    const ready = false; // True if the counter collection has been updated and the document is ready to be saved.
    const ranOnce = doc.__maiRanOnce === true;

    // Only do this if it is a new document & the field doesn't have a value set (see http://mongoosejs.com/docs/api.html#document_Document-isNew)
    if ((doc.isNew && ranOnce === false) || settings.migrate) {
      (function save() {
        // Find the counter for this model and the relevant field.
        IdentityCounter.findOne({
          model: settings.model,
          field: settings.field,
          groupingField: doc.get(settings.groupingField) || '',
        })
          .exec()
          .then(counter => {
            if (counter) {
              return counter;
            }

            // If no counter exists then create one and save it.
            counter = new IdentityCounter({
              model: settings.model,
              field: settings.field,
              groupingField: doc.get(settings.groupingField) || '',
              count: settings.startAt - settings.incrementBy,
            });

            return counter.save();
          })
          .then(counter => {
            // check that a number has already been provided, and update the counter to that number if it is
            // greater than the current count
            if (typeof doc.get(settings.field) === 'number') {
              return IdentityCounter.findOneAndUpdate(
                {
                  model: settings.model,
                  field: settings.field,
                  groupingField: doc.get(settings.groupingField) || '',
                  count: { $lt: doc.get(settings.field) },
                },
                {
                  // Change the count of the value found to the new field value.
                  count: doc.get(settings.field),
                }
              ).exec();
            }
            // Find the counter collection entry for this model and field and update it.
            return IdentityCounter.findOneAndUpdate(
              {
                model: settings.model,
                field: settings.field,
                groupingField: doc.get(settings.groupingField) || '',
              },
              {
                // Increment the count by `incrementBy`.
                $inc: { count: settings.incrementBy },
              },
              {
                // new:true specifies that the callback should get the counter AFTER it is updated (incremented).
                new: true,
              }
            )
              .exec()
              .then(updatedIdentityCounter => {
                let count = updatedIdentityCounter.count;

                // if an output filter was provided, apply it.
                if (typeof settings.outputFilter === 'function') {
                  count = settings.outputFilter(updatedIdentityCounter.count);
                }

                // If there are no errors then go ahead and set the document's field to the current count.
                doc.set(settings.field, count);
                doc.__maiRanOnce = true;
              });
          })
          .then(next)
          .catch(err => {
            if (err.name === 'MongoError' && err.code === 11000) {
              setTimeout(save, 5);
            } else {
              next(err);
            }
          });
      })();
      // If the document does not have the field we're interested in or that field isn't a number AND the user did
      // not specify that we should increment on updates, then just continue the save without any increment logic.
    } else {
      next();
    }
  });

  // Declare a function to get the next counter for the model/schema.
  function nextCount() {
    let groupingFieldValue = '';
    let callback;

    if (typeof arguments[0] !== 'function') {
      groupingFieldValue = arguments[0].toString();
      callback = arguments[1];
    } else {
      callback = arguments[0];
    }

    IdentityCounter.findOne(
      {
        model: settings.model,
        field: settings.field,
        groupingField: groupingFieldValue,
      },
      (err, counter) => {
        if (err) {
          callback(err);
          return;
        }
        callback(null, counter === null ? settings.startAt : counter.count + settings.incrementBy);
      }
    );
  }

  // Declare a function to reset counter at the start value - increment value.
  function resetCount() {
    let groupingFieldValue = '';
    let callback;

    if (typeof arguments[0] !== 'function') {
      groupingFieldValue = arguments[0].toString();
      callback = arguments[1];
    } else {
      callback = arguments[0];
    }

    IdentityCounter.findOneAndUpdate(
      { model: settings.model, field: settings.field, groupingField: groupingFieldValue },
      { count: settings.startAt - settings.incrementBy },
      { new: true }, // new: true specifies that the callback should get the updated counter.
      err => {
        if (err) {
          callback(err);
          return;
        }
        callback(null, settings.startAt);
      }
    );
  }
};
