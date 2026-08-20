const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { Sequelize } = require('sequelize');
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();
const namespace = {
  run: (store, fn) => {
    if (typeof store === 'function') {
      return storage.run(new Map(), store);
    }
    return storage.run(store, fn);
  },
  bind: (fn) => fn,
  get: (key) => {
    const store = storage.getStore();
    return store ? store.get(key) : undefined;
  },
  set: (key, value) => {
    const store = storage.getStore();
    if (store) store.set(key, value);
    return value;
  },
  getStore: () => storage.getStore()
};

Sequelize.useCLS(namespace);

const isProduction = process.env.NODE_ENV === 'production';

let sequelize;

if (process.env.DATABASE_URL) {
  if (!isProduction && process.env.DATABASE_URL.includes('neon.tech')) {
    // In local development on Windows, Winsock DNS getaddrinfo often fails on Neon CNAMEs.
    // Explicitly parse the database URL and use direct IP with SNI servername for SSL.
    const dbUrl = new URL(process.env.DATABASE_URL);
    sequelize = new Sequelize(
      dbUrl.pathname.substring(1),
      dbUrl.username,
      dbUrl.password,
      {
        host: '18.229.40.57', // Resolved IP for Neon sa-east-1
        port: dbUrl.port || 5432,
        dialect: 'postgres',
        logging: false,
        dialectOptions: {
          ssl: {
            require: true,
            rejectUnauthorized: false,
            servername: dbUrl.hostname
          }
        },
        pool: {
          max: 10,
          min: 0,
          acquire: 30000,
          idle: 10000
        },
        define: {
          timestamps: true,
          underscored: true
        }
      }
    );
  } else {
    // Standard connection for production (Render)
    sequelize = new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      logging: false,
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      },
      pool: {
        max: isProduction ? 5 : 10,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
      define: {
        timestamps: true,
        underscored: true
      }
    });
  }
} else {
  sequelize = new Sequelize(
    process.env.DB_NAME || 'farmasys',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || 'postgres',
    {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      dialect: 'postgres',
      logging: false,
      pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
      define: {
        timestamps: true,
        underscored: true
      }
    }
  );
}

sequelize.namespace = namespace;
module.exports = sequelize;
