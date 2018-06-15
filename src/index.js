// @flow

import mongoose, {
  type MongooseConnection,
  type MongooseSchema,
  type MongooseDocument,
  type MongooseModel,
} from 'mongoose';

export type AutoIncSettings = {|
  migrate?: boolean, // If this is to be run on a migration for existing records. Only set this on migration processes.
  model: string, // The model to configure the plugin for.
  field: string, // The field the plugin should track.
  groupingField: string, // The field by which to group documents, allowing for each grouping to be incremented separately.
  startAt: number, // The number the count should start at.
  incrementBy: number, // The number by which to increment the count each time.
  unique?: boolean, // Should we create a unique index for the field,
  outputFilter?: (count: number) => number, // function that modifies the output of the counter.
|};
export type AutoIncOptions = string | $Shape<AutoIncSettings>;

declare class IdentityCounterDoc extends Mongoose$Document {
  model: string;
  field: string;
  groupingField: string;
  count: number;
  constructor(data?: $Shape<this>): IdentityCounterModel;
}

export type IdentityCounterModel = typeof IdentityCounterDoc;

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

export function initialize(): void {
  console.log(
    `MongooseAutoIncrement.initialize() method is deprecated. ` +
      `Just remove this method, it not required anymore.`
  );
}

function isMongoDuplicateError(e: any): boolean {
  return e.code * 1 === 11000;
}

// Initialize plugin by creating counter collection in database.
function initIdentityCounter(connection: MongooseConnection): IdentityCounterModel {
  let identityCounter;

  try {
    identityCounter = connection.model('IdentityCounter');
  } catch (ex) {
    if (ex.name === 'MissingSchemaError') {
      // Create model using new schema.
      identityCounter = connection.model('IdentityCounter', counterSchema);
    } else {
      throw ex;
    }
  }
  return identityCounter;
}

async function createCounterIfNotExist(
  IC: IdentityCounterModel,
  settings: AutoIncSettings,
  doc: MongooseDocument
): Promise<void> {
  const groupingField = doc.get(settings.groupingField) || '';

  let existedCounter: IdentityCounterDoc = (await IC.findOne({
    model: settings.model,
    field: settings.field,
    groupingField,
  }).exec(): any);

  try {
    if (!existedCounter) {
      // Check old record format without `groupingField`,
      // convert old record to the new format
      existedCounter = (await IC.findOne({
        model: settings.model,
        field: settings.field,
        groupingField: { $exists: false },
      }): any);
      if (existedCounter) {
        existedCounter.groupingField = '';
        await existedCounter.save();
      }
    }

    if (!existedCounter) {
      // If no counter exists then create one and save it.
      existedCounter = (new IC({
        model: settings.model,
        field: settings.field,
        groupingField,
        count: settings.startAt - settings.incrementBy,
      }): any);

      await existedCounter.save();
    }
  } catch (e) {
    if (isMongoDuplicateError(e)) {
      return;
    }

    throw e; // other unhandled errors
  }
}

async function preSave(
  IC: IdentityCounterModel,
  settings: AutoIncSettings,
  doc: MongooseDocument,
  next: Function,
  attempts: number = 0
) {
  try {
    // it is a first run
    if (!attempts) {
      await createCounterIfNotExist(IC, settings, doc);
    }

    if (typeof doc.get(settings.field) === 'number') {
      // check that a number has already been provided, and update the counter
      // to that number if it is greater than the current count
      await IC.findOneAndUpdate(
        {
          model: settings.model,
          field: settings.field,
          groupingField: doc.get(settings.groupingField) || '',
          count: { $lt: doc.get(settings.field) },
        },
        {
          count: doc.get(settings.field),
        }
      ).exec();
    } else {
      // Find the counter collection entry for this model and field and update it.
      // Should be done via atomic mongodb operation, cause parallel processes may change value
      const updatedCounter = await IC.findOneAndUpdate(
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
      ).exec();

      if (!updatedCounter) {
        throw new Error(`MongooseAutoInc cannot update counter for ${settings.model}`);
      }

      let { count } = updatedCounter;

      // if an output filter was provided, apply it.
      if (typeof settings.outputFilter === 'function') {
        count = settings.outputFilter(count);
      }

      // If there are no errors then go ahead and set the document's field to the current count.
      doc.set(settings.field, count);

      // $FlowFixMe
      doc.__maiRanOnce = true; // eslint-disable-line
    }

    next();
  } catch (err) {
    if (isMongoDuplicateError(err) && attempts * 1 < 10) {
      setTimeout(() => preSave(IC, settings, doc, next, attempts + 1), 5);
    } else {
      next(err);
    }
  }
}

// Declare a function to get the next counter for the model/schema.
async function nextCount(
  IC: IdentityCounterModel,
  settings: AutoIncSettings,
  groupingFieldValue?: string
): Promise<number> {
  const counter = await IC.findOne({
    model: settings.model,
    field: settings.field,
    groupingField: groupingFieldValue || '',
  }).exec();

  return !counter ? settings.startAt : counter.count + settings.incrementBy;
}

// Declare a function to reset counter at the start value - increment value.
async function resetCount(
  IC: IdentityCounterModel,
  settings: AutoIncSettings,
  groupingFieldValue?: string
): Promise<number> {
  await IC.findOneAndUpdate(
    { model: settings.model, field: settings.field, groupingField: groupingFieldValue || '' },
    { count: settings.startAt - settings.incrementBy },
    { new: true } // new: true specifies that the callback should get the updated counter.
  ).exec();

  return settings.startAt;
}

// The function to use when invoking the plugin on a custom schema.
export function autoIncrement(
  schema: MongooseSchema<MongooseDocument>,
  options: AutoIncOptions
): void {
  const compoundIndex = {};

  let _IC_: IdentityCounterModel;
  function getIC(connection: MongooseConnection) {
    if (!_IC_) {
      _IC_ = initIdentityCounter(connection);
    }
    return _IC_;
  }

  // Default settings and plugin scope variables.
  let settings: $Shape<AutoIncSettings> = {
    migrate: false,
    model: undefined,
    field: '_id',
    groupingField: '',
    startAt: 0,
    incrementBy: 1,
    unique: true,
    outputFilter: undefined,
  };

  switch (typeof options) {
    // If string, the user chose to pass in just the model name.
    case 'string':
      settings.model = options;
      break;
    // If object, the user passed in a hash of options.
    case 'object':
      settings = ({ ...settings, ...options }: any);
      break;
    default:
  }

  if (typeof settings.model !== 'string') {
    throw new Error('model must be set');
  }

  if (settings.field === '_id' && settings.groupingField.length) {
    throw new Error('Cannot use a grouping field with _id, choose a different field name.');
  }

  if (!schema.path(settings.field) || settings.field === '_id') {
    schema.path(settings.field, Number);
  }

  if (settings.groupingField.length) {
    // If a groupingField is specified, create a compound unique index.
    compoundIndex[settings.field] = 1;
    compoundIndex[settings.groupingField] = 1;
    schema.index(compoundIndex, { unique: settings.unique });
  } else if (settings.field !== '_id') {
    // Otherwise, add the unique index directly to the custom field.
    schema.path(settings.field).index({ unique: settings.unique });
  }

  // Add nextCount as both a method on documents and a static on the schema for convenience.
  schema.method('nextCount', function(groupingFieldValue?: string) {
    const doc: MongooseDocument = this;
    const IC = getIC(doc.collection.conn);
    return nextCount(IC, settings, groupingFieldValue);
  });
  // $FlowFixMe
  schema.static('nextCount', function(groupingFieldValue?: string) {
    const model: MongooseModel = this;
    const IC = getIC(model.collection.conn);
    return nextCount(IC, settings, groupingFieldValue);
  });

  // Add resetCount as both a method on documents and a static on the schema for convenience.
  schema.method('resetCount', function(groupingFieldValue?: string) {
    const doc: MongooseDocument = this;
    const IC = getIC(doc.collection.conn);
    return resetCount(IC, settings, groupingFieldValue);
  });
  // $FlowFixMe
  schema.static('resetCount', function(groupingFieldValue?: string) {
    const model: MongooseModel = this;
    const IC = getIC(model.collection.conn);
    return resetCount(IC, settings, groupingFieldValue);
  });

  // Every time documents in this schema are saved, run this logic.
  schema.post('validate', function(doc: MongooseDocument, next: Function) {
    // Get reference to the document being saved.
    //const doc: MongooseDocument = this;
    // $FlowFixMe
    const alreadyGetId = doc.__maiRanOnce === true;

    // Only do this if it is a new document & the field doesn't have
    // a value set (see http://mongoosejs.com/docs/api.html#document_Document-isNew)
    if ((doc.isNew && !alreadyGetId) || settings.migrate) {
      const IC = getIC(doc.collection.conn);
      preSave(IC, settings, doc, next);
    } else {
      // If the document does not have the field we're interested in or that field isn't a number AND the user did
      // not specify that we should increment on updates, then just continue the save without any increment logic.
      next();
    }
  });
}

export function plugin(schema: MongooseSchema<MongooseDocument>, options: AutoIncOptions): void {
  return autoIncrement(schema, options);
}

export default autoIncrement;
