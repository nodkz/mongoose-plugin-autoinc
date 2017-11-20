# WIP [Sep 14, 2017] Forked from: https://github.com/Dashride/mongoose-auto-increment/commit/3806d2caea096a0aefd2610ffde37b3924a86e13

# mongoose-auto-increment
[![](https://img.shields.io/npm/v/mongoose-plugin-autoinc.svg)](https://www.npmjs.com/package/mongoose-plugin-autoinc)
[![codecov coverage](https://img.shields.io/codecov/c/github/graphql-compose/mongoose-plugin-autoinc.svg)](https://codecov.io/github/graphql-compose/mongoose-plugin-autoinc)
[![Travis](https://img.shields.io/travis/graphql-compose/mongoose-plugin-autoinc.svg?maxAge=2592000)](https://travis-ci.org/graphql-compose/mongoose-plugin-autoinc)
[![npm](https://img.shields.io/npm/dt/mongoose-plugin-autoinc.svg)](http://www.npmtrends.com/mongoose-plugin-autoinc)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)

---

> This is the module used by [mongoose-simpledb](https://github.com/codetunnel/mongoose-simpledb) to increment Number IDs. You are perfectly able to use this module by itself if you would like. However, if you're looking to make your life easier when using [mongoose](http://mongoosejs.com/) then I highly recommend you check out simpledb. It's a small wrapper around mongoose but it makes it extremely easy to deal with your models and draws a clear path for how to use mongoose in your application.

## Getting Started

> npm install mongoose-auto-increment

Once you have the plugin installed it is very simple to use. Just get reference to it, initialize it by passing in your
mongoose connection and pass `autoIncrement.plugin` to the `plugin()` function on your schema.

> Note: You only need to initialize MAI once.

````js
var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    autoIncrement = require('mongoose-auto-increment');

var connection = mongoose.createConnection("mongodb://localhost/myDatabase");

autoIncrement.initialize(connection);

var bookSchema = new Schema({
    author: { type: Schema.Types.ObjectId, ref: 'Author' },
    title: String,
    genre: String,
    publishDate: Date
});

bookSchema.plugin(autoIncrement.plugin, 'Book');
var Book = connection.model('Book', bookSchema);
````

That's it. Now you can create book entities at will and they will have an `_id` field added of type `Number` and will automatically increment with each new document. Even declaring references is easy, just remember to change the reference property's type to `Number` instead of `ObjectId` if the referenced model is also using the plugin.

````js
var authorSchema = new mongoose.Schema({
    name: String
});

var bookSchema = new Schema({
    author: { type: Number, ref: 'Author' },
    title: String,
    genre: String,
    publishDate: Date
});

bookSchema.plugin(autoIncrement.plugin, 'Book');
authorSchema.plugin(autoIncrement.plugin, 'Author');
````

### Want a field other than `_id`?

````js
bookSchema.plugin(autoIncrement.plugin, { model: 'Book', field: 'bookId' });
````

### Want that field to start at a different number than zero or increment by more than one?

````js
bookSchema.plugin(autoIncrement.plugin, {
    model: 'Book',
    field: 'bookId',
    startAt: 100,
    incrementBy: 100
});
````

Your first book document would have a `bookId` equal to `100`. Your second book document would have a `bookId` equal to `200`, and so on.

### Want to know the next number coming up?

````js
var Book = connection.model('Book', bookSchema);
Book.nextCount(function(err, count) {

    // count === 0 -> true

    var book = new Book();
    book.save(function(err) {

        // book._id === 0 -> true

        book.nextCount(function(err, count) {

            // count === 1 -> true

        });
    });
});
````

nextCount is both a static method on the model (`Book.nextCount(...)`) and an instance method on the document (`book.nextCount(...)`).

### Want to reset counter back to the start value?

````js
bookSchema.plugin(autoIncrement.plugin, {
    model: 'Book',
    field: 'bookId',
    startAt: 100
});

var Book = connection.model('Book', bookSchema),
    book = new Book();

book.save(function (err) {

    // book._id === 100 -> true

    book.nextCount(function(err, count) {

        // count === 101 -> true

        book.resetCount(function(err, nextCount) {

            // nextCount === 100 -> true

        });

    });

});
````
