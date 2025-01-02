const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();

// HealthSync cluster'ına bağlantı URI'si
// const uri = "mongodb+srv://hyrllh1414:<LoWNCEobMb3X3rMI>@cluster0.6ey7g.mongodb.net/Health_db?retryWrites=true&w=majority";
const uri = "mongodb+srv://hyrllh1414:<LoWNCEobMb3X3rMI>@cluster0.6ey7g.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  });

  try {
    await client.connect();
    const db = client.db("Health_db"); // Health_db veritabanına bağlan
    
    // Koleksiyonları kontrol et ve yoksa oluştur
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);

    if (!collectionNames.includes('user')) {
      await db.createCollection('user');
    }
    if (!collectionNames.includes('tokens')) {
      await db.createCollection('tokens');
    }
    if (!collectionNames.includes('exercises')) {
      await db.createCollection('exercises');
    }
    if (!collectionNames.includes('nutrition')) {
      await db.createCollection('nutrition');
    }
    
    console.log('MongoDB bağlantısı başarılı - HealthSync/Cluster0/Health_db');
    
    cachedClient = client;
    cachedDb = db;
    
    return { client, db };
  } catch (error) {
    console.error("MongoDB bağlantı hatası:", error);
    throw error;
  }
}

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'health_sync_secret_key';

// Register endpoint
app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, name, height, weight, age } = req.body;
    const { db } = await connectToDatabase();
    
    // user collection'da email kontrolü
    const existingUser = await db.collection('user').findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    
    const user = {
      email,
      name,
      height,
      weight,
      age,
      created_at: new Date().toISOString()
    };
    
    // user collection'a kayıt
    const result = await db.collection('user').insertOne(user);
    
    const payload = {
      user_id: result.insertedId.toString(),
      email: email,
      roles: ["user"],
      exp: Math.floor(Date.now() / 1000) + (60 * 60)
    };
    
    const token = jwt.sign(payload, JWT_SECRET);
    const refreshToken = jwt.sign({ user_id: result.insertedId.toString() }, JWT_SECRET);
    
    const response = {
      user_id: result.insertedId.toString(),
      email,
      token: token,
      refresh_token: refreshToken,
      profile: { ...user, id: result.insertedId }
    };
    
    await db.collection('tokens').insertOne({ token, ...response });
    console.log('Yeni kullanıcı kaydedildi:', email);
    res.json(response);
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login endpoint
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { db } = await connectToDatabase();
    
    const user = await db.collection('user').findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    
    const payload = {
      user_id: user._id.toString(),
      email: email,
      roles: ["user"],
      exp: Math.floor(Date.now() / 1000) + (60 * 60)
    };
    
    const token = jwt.sign(payload, JWT_SECRET);
    const refreshToken = jwt.sign({ user_id: user._id.toString() }, JWT_SECRET);
    
    const response = {
      user_id: user._id.toString(),
      email: email,
      token: token,
      refresh_token: refreshToken,
      profile: {
        id: user._id,
        name: user.name,
        height: user.height,
        weight: user.weight,
        age: user.age,
        created_at: user.created_at
      }
    };
    
    await db.collection('tokens').insertOne({ token, ...response });
    console.log('Kullanıcı giriş yaptı:', email);
    res.json(response);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Token yenileme endpoint'i
app.post('/auth/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    const { db } = await connectToDatabase();

    const decoded = jwt.verify(refresh_token, JWT_SECRET);
    const user = await db.collection('user').findOne({ _id: decoded.user_id });
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    
    const payload = {
      user_id: user._id.toString(),
      email: user.email,
      roles: ["user"],
      exp: Math.floor(Date.now() / 1000) + (60 * 60)
    };
    
    const token = jwt.sign(payload, JWT_SECRET);
    const newRefreshToken = jwt.sign({ user_id: user._id.toString() }, JWT_SECRET);
    
    res.json({
      token,
      refresh_token: newRefreshToken
    });
  } catch (error) {
    console.error('Token yenileme hatası:', error);
    res.status(401).json({ message: 'Invalid refresh token' });
  }
});

// Exercise endpoint
app.post('/exercises', async (req, res) => {
  try {
    const { user_id, name, duration, calories_burned } = req.body;
    const token = req.headers.authorization?.split(' ')[1];
    
    const { db } = await connectToDatabase();
    const tokenDoc = await db.collection('tokens').findOne({ token });
    
    if (!token || !tokenDoc) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const exercise = {
      user_id,
      name,
      duration,
      calories_burned,
      date: new Date().toISOString()
    };
    
    const result = await db.collection('exercises').insertOne(exercise);
    console.log('Yeni egzersiz kaydedildi:', name);
    res.json({ ...exercise, id: result.insertedId });
  } catch (error) {
    console.error('Exercise error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Development server
if (process.env.NODE_ENV !== 'production') {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Development server running on port ${port}`);
  });
}

module.exports = app;