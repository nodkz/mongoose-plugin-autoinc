// @flow

const mongoose = require('mongoose');

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

export const initialize = (connection: any) => {
  try {
    IdentityCounter = connection.model('IdentityCounter');
  } catch (ex) {
    if (ex.name === 'MissingSchemaError') {
      IdentityCounter = connection.model('IdentityCounter', counterSchema);
    } else {
      throw ex;
    }
  }
};

export const nextCount = (settings: any) => {
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
        return callback(err);
      }
      callback(null, counter === null ? settings.startAt : counter.count + settings.incrementBy);
      return counter;
    }
  );
};

export const resetCount = (settings: any) => {
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
      if (err) return callback(err);
      callback(null, settings.startAt);
      return 'Callback has invoked!'; // FIXME: think about return value
    }
  );
};

export const setByPath = () => {};

// FIXME: import flow type and put correct annotations
// $FlowFixMe
export const autoIncrement = (schema, options) => {
  const compoundIndex = {};
  let settings = {
    migrate: false,
    model: null,
    field: '_id',
    groupingField: '',
    startAt: 0,
    incrementBy: 1,
    unique: true,
    outputFilter: undefined,
  };

  if (!counterSchema || !IdentityCounter) {
    throw new Error('mongoose-auto-increment has not been initialized');
  }

  switch (typeof options) {
    case 'string':
      settings.model = options;
      break;
    case 'object':
      settings = { ...settings, ...options };
      break;
    // FIXME: think about default case
    default:
      console.log('default settings'); //eslint-disable-line
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
    schema.path(settings.field, Number);
  }

  if (settings.groupingField.length) {
    compoundIndex[settings.field] = 1;
    compoundIndex[settings.groupingField] = 1;
    schema.index(compoundIndex, { unique: settings.unique });
  } else if (settings.field !== '_id') {
    schema.path(settings.field).index({ unique: settings.unique });
  }

  schema.method('nextCount', nextCount);
  schema.static('nextCount', nextCount);

  schema.method('resetCount', resetCount);
  schema.static('resetCount', resetCount);

  schema.pre('validate', async function preValidate(next) {
    const doc = this;
    const ranOnce = doc.__maiRanOnce === true;

    if ((doc.isNew && ranOnce === false) || settings.migrate) {
      try {
        let counter = await IdentityCounter.findOne({
          model: settings.model,
          field: settings.field,
          groupingField: doc.get(settings.groupingField) || '',
        });

        if (!counter) {
          counter = new IdentityCounter({
            model: settings.model,
            field: settings.field,
            groupingField: doc.get(settings.groupingField) || '',
            count: settings.startAt - settings.incrementBy,
          });
          counter = await counter.save();
        }

        if (typeof doc.get(settings.field) === 'number') {
          counter = await IdentityCounter.findOneAndUpdate(
            {
              model: settings.model,
              field: settings.field,
              groupingField: doc.get(settings.groupingField) || '',
              count: { $lt: doc.get(settings.field) },
            },
            {
              count: doc.get(settings.field),
            }
          );
        } else {
          counter = await IdentityCounter.findOneAndUpdate(
            {
              model: settings.model,
              field: settings.field,
              groupingField: doc.get(settings.groupingField) || '',
            },
            {
              $inc: { count: settings.incrementBy },
            },
            {
              new: true,
            }
          );
        }

        let count = counter.count;
        if (typeof settings.outputFilter === 'function') {
          count = settings.outputFilter(counter.count);
        }

        doc.set(settings.field, count);
        doc.__maiRanOnce = true;  //eslint-disable-line
        next();
      } catch (err) {
        next(err);
      }
    } else {
      next();
    }
  });
};
