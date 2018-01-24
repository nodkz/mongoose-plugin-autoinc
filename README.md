# mongoose-plugin-autoinc
[![](https://img.shields.io/npm/v/mongoose-plugin-autoinc.svg)](https://www.npmjs.com/package/mongoose-plugin-autoinc)
[![codecov coverage](https://img.shields.io/codecov/c/github/nodkz/mongoose-plugin-autoinc.svg)](https://codecov.io/github/nodkz/mongoose-plugin-autoinc)
[![Travis](https://img.shields.io/travis/nodkz/mongoose-plugin-autoinc.svg?maxAge=2592000)](https://travis-ci.org/nodkz/mongoose-plugin-autoinc)
[![npm](https://img.shields.io/npm/dt/mongoose-plugin-autoinc.svg)](http://www.npmtrends.com/mongoose-plugin-autoinc)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)

---

This is a fork of [mongoose-auto-increment](https://github.com/chevex-archived/mongoose-auto-increment) which has not been maintained in a while. Also used fixes and changes from [dashride fork](https://github.com/Dashride/mongoose-auto-increment). This fork addresses the following issues:
- fix error `'required' is not valid for an index specification` for Mongoose 4
- does not require established connection for initialization **(deprecate `initialize()` method)**
- include Flowtype and Typescript declarations
- tested with Mongoose 5
- setup automatic package publishing on PR merge with Travis CI and [sematic-release](https://github.com/semantic-release/semantic-release)

## Getting Started

> npm install mongoose-plugin-autoinc

Once you have the plugin installed it is very simple to use. Just pass `autoIncrement` to the `plugin()` function on your schema.

> Note: You only need to initialize MAI once.

````js
import mongoose from 'mongoose';
import { autoIncrement } from 'mongoose-plugin-autoinc';

const connection = mongoose.createConnection("mongodb://localhost/myDatabase");

const BookSchema = new mongoose.Schema({
    author: { type: Schema.Types.ObjectId, ref: 'Author' },
    title: String,
    genre: String,
    publishDate: Date
});

BookSchema.plugin(autoIncrement, 'Book');
const Book = connection.model('Book', BookSchema);
````

That's it. Now you can create book entities at will and they will have an `_id` field added of type `Number` and will automatically increment with each new document. Even declaring references is easy, just remember to change the reference property's type to `Number` instead of `ObjectId` if the referenced model is also using the plugin.

````js
const AuthorSchema = new mongoose.Schema({
    name: String
});

const BookSchema = new mongoose.Schema({
    author: { type: Number, ref: 'Author' },
    title: String,
    genre: String,
    publishDate: Date
});

BookSchema.plugin(autoIncrement, 'Book');
AuthorSchema.plugin(autoIncrement, 'Author');
````

### Want a field other than `_id`?

````js
BookSchema.plugin(autoIncrement, { model: 'Book', field: 'bookId' });
````

### Want that field to start at a different number than zero or increment by more than one?

````js
BookSchema.plugin(autoIncrement, {
    model: 'Book',
    field: 'bookId',
    startAt: 100,
    incrementBy: 100
});
````

Your first book document would have a `bookId` equal to `100`. Your second book document would have a `bookId` equal to `200`, and so on.

### Want to know the next number coming up?

````js
const Book = connection.model('Book', BookSchema);
Book.nextCount((err, count) => {

    // count === 0 -> true

    const book = new Book();
    book.save(err1 => {

        // book._id === 0 -> true

        book.nextCount((err2, count) => {

            // count === 1 -> true

        });
    });
});
````

nextCount is both a static method on the model (`Book.nextCount(...)`) and an instance method on the document (`book.nextCount(...)`).

### Want to reset counter back to the start value?

````js
BookSchema.plugin(autoIncrement, {
    model: 'Book',
    field: 'bookId',
    startAt: 100
});

const Book = connection.model('Book', BookSchema),
    book = new Book();

book.save(err => {

    // book._id === 100 -> true

    book.nextCount((err1, count) => {

        // count === 101 -> true

        book.resetCount((err2, nextCount) => {

            // nextCount === 100 -> true

        });

    });

});
````
