const mongoose = require('mongoose');

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGO_URI).then((mongoose) => {
      console.log('MongoDB connected successfully!');
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    throw err; // вместо process.exit(1)
  }
};

module.exports = connectDB;