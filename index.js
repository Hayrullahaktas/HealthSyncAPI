const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();

// MongoDB bağlantı URI'si
const uri = "mongodb+srv://hyrllh1414:<db_password>@cluster0.6ey7g.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// MongoDB koleksiyonları için referanslar
let db;
let users;
let exercises;
let nutrition;
let tokens;

// MongoDB bağlantısını başlat
async function connectToDatabase() {
  try {
    await client.connect();
    db = client.db("healthsync");
    users = db.collection("users");
    exercises = db.collection("exercises");
    nutrition = db.collection("nutrition");
    tokens = db.collection("tokens");
    console.log("MongoDB'ye başarıyla bağlanıldı!");
  } catch (error) {
    console.error("MongoDB bağlantı hatası:", error);
  }
}
connectToDatabase();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'health_sync_secret_key';

// Login endpoint
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await users.findOne({ email });
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
    
    await tokens.insertOne({ token, ...response });
    res.json(response);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Register endpoint
app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, name, height, weight, age } = req.body;
    
    // Email kontrolü
    const existingUser = await users.findOne({ email });
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
    
    const result = await users.insertOne(user);
    
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
    
    await tokens.insertOne({ token, ...response });
    res.json(response);
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Exercise endpoint
app.post('/exercises', async (req, res) => {
  try {
    const { user_id, name, duration, calories_burned } = req.body;
    const token = req.headers.authorization?.split(' ')[1];
    
    const tokenDoc = await tokens.findOne({ token });
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
    
    const result = await exercises.insertOne(exercise);
    res.json({ ...exercise, id: result.insertedId });
  } catch (error) {
    console.error('Exercise error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Nutrition endpoint
app.post('/nutrition', async (req, res) => {
  try {
    const { user_id, food_name, calories, protein, carbs, fat } = req.body;
    const token = req.headers.authorization?.split(' ')[1];
    
    const tokenDoc = await tokens.findOne({ token });
    if (!token || !tokenDoc) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const nutritionEntry = {
      user_id,
      food_name,
      calories,
      protein,
      carbs,
      fat,
      consumed_at: new Date().toISOString()
    };
    
    const result = await nutrition.insertOne(nutritionEntry);
    res.json({ ...nutritionEntry, id: result.insertedId });
  } catch (error) {
    console.error('Nutrition error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Token yenileme endpoint'i
app.post('/auth/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    const decoded = jwt.verify(refresh_token, JWT_SECRET);
    
    const user = await users.findOne({ _id: decoded.user_id });
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    
    const payload = {
      user_id: user._id.toString(),
      roles: ["user"],
      exp: Math.floor(Date.now() / 1000) + (60 * 60)
    };
    
    const newToken = jwt.sign(payload, JWT_SECRET);
    const newRefreshToken = jwt.sign({ user_id: user._id.toString() }, JWT_SECRET);
    
    res.json({
      token: newToken,
      refresh_token: newRefreshToken
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({ message: 'Invalid refresh token' });
  }
});

// Development server
if (process.env.NODE_ENV !== 'production') {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Development server running on port ${port}`);
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await client.close();
  process.exit();
});

module.exports = app;
module.exports = app;