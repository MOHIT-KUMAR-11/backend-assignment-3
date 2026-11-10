require('dotenv').config();

const app = require('./src/app');
const { connectDB, disconnectDB } = require('./src/config/db');

const PORT = Number(process.env.PORT) || 5000;

async function start() {
  try {
    await connectDB();
  } catch (err) {
    console.error(`Failed to connect to MongoDB: ${err.message}`);
    console.error('Is MongoDB running? Check MONGO_URI in your .env file.');
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT} (${process.env.NODE_ENV || 'development'})`);
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} received, shutting down...`);
    server.close();
    await disconnectDB();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
