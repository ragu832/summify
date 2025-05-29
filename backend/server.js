import express from 'express';
import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Utility function to calculate word frequency
function calculateWordFrequency(text) {
    const words = text.toLowerCase().match(/\w+/g) || [];
    const frequency = {};
    words.forEach(word => {
        frequency[word] = (frequency[word] || 0) + 1;
    });
    return frequency;
}

// Utility function to calculate sentence scores
function calculateSentenceScores(sentences, wordFreq) {
    return sentences.map(sentence => {
        const words = sentence.toLowerCase().match(/\w+/g) || [];
        const score = words.reduce((sum, word) => sum + (wordFreq[word] || 0), 0);
        return score / words.length;
    });
}

const app = express();
const port = 3001;
const mongoUrl = 'mongodb://127.0.0.1:27017/';
const dbName = 'summify';

// Enable CORS with specific configuration
app.use(cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));
app.use(express.json());

// Create uploads directory if it doesn't exist
const uploadDir = join(__dirname, 'uploads');
fs.mkdir(uploadDir, { recursive: true }).catch(console.error);

// Configure multer for file uploads
const storage = multer.diskStorage({
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    destination: async function (req, file, cb) {
        try {
            const uploadDir = join(__dirname, 'uploads');
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (err) {
            cb(err);
        }
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File is too large. Maximum size is 10MB.' });
        }
        return res.status(400).json({ error: err.message });
    } else if (err) {
        return res.status(400).json({ error: err.message });
    }
    next();
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: function (req, file, cb) {
        const allowedTypes = {
            'application/pdf': true,
            'text/plain': true,
            'application/msword': true,
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true
        };

        if (allowedTypes[file.mimetype]) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Supported formats: PDF, TXT, DOC, DOCX'));
        }
    }
});

app.use(express.json());
app.use(cors());

let db;
let client;

// Connect to MongoDB
const connectDB = async () => {
    try {
        console.log('Attempting to connect to MongoDB at:', mongoUrl);
        client = await MongoClient.connect(mongoUrl);
        db = client.db(dbName);
        console.log('Connected to MongoDB');
        
        // Create indexes
        await db.collection('users').createIndex({ email: 1 }, { unique: true });
        
        return db;
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
};

// Initialize database connection
connectDB();

// Helper function to extract text from files
async function extractTextFromFile(file) {
    if (!file || !file.path) {
        throw new Error('Invalid file object');
    }

    const filePath = file.path;
    const fileType = file.mimetype;

    try {
        let text = '';

        switch (fileType) {
            case 'application/pdf':
                try {
                    const pdfData = await fs.readFile(filePath);
                    const pdfContent = await pdfParse(pdfData);
                    text = pdfContent.text;
                } catch (error) {
                    throw new Error('Failed to parse PDF file: ' + error.message);
                }
                break;

            case 'text/plain':
                try {
                    text = await fs.readFile(filePath, 'utf-8');
                } catch (error) {
                    throw new Error('Failed to read text file: ' + error.message);
                }
                break;

            case 'application/msword':
            case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                try {
                    const result = await mammoth.extractRawText({ path: filePath });
                    text = result.value;
                } catch (error) {
                    throw new Error('Failed to parse Word document: ' + error.message);
                }
                break;

            default:
                throw new Error('Unsupported file type');
        }

        if (!text || text.trim().length === 0) {
            throw new Error('Extracted text is empty');
        }

        // Clean up the uploaded file
        await fs.unlink(filePath).catch(() => {});

        return text;
    } catch (error) {
        // Clean up the file in case of error
        await fs.unlink(filePath).catch(() => {});
        throw error;
    }
}

// Helper function to generate summary using extractive summarization
async function generateSummary(text, length = 'medium') {
    console.log('Starting summary generation for text length:', text.length);
    
    // Clean and validate the text
    text = text.replace(/\s+/g, ' ').trim();
    console.log('Cleaned text length:', text.length);

    if (!text) {
        throw new Error('Input text is empty');
    }

    if (text.length < 50) {
        throw new Error('Text is too short to summarize');
    }

    try {
        // Split text into sentences
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
        if (sentences.length === 0) {
            throw new Error('Could not split text into sentences');
        }

        // Calculate word frequency
        const wordFreq = calculateWordFrequency(text);

        // Score sentences
        const scores = calculateSentenceScores(sentences, wordFreq);

        // Determine how many sentences to include based on length preference
        const sentenceCounts = {
            short: Math.max(2, Math.ceil(sentences.length * 0.2)),
            medium: Math.max(4, Math.ceil(sentences.length * 0.3)),
            long: Math.max(6, Math.ceil(sentences.length * 0.4))
        };

        const numSentences = sentenceCounts[length] || sentenceCounts.medium;

        // Get indices of top-scoring sentences while maintaining original order
        const indices = scores
            .map((score, index) => ({ score, index }))
            .sort((a, b) => b.score - a.score)
            .slice(0, numSentences)
            .sort((a, b) => a.index - b.index)
            .map(item => item.index);

        // Build summary from selected sentences
        const summary = indices.map(index => sentences[index].trim()).join(' ');

        console.log('Generated summary length:', summary.length);
        return summary;
    } catch (error) {
        console.error('Summary generation error:', error);
        console.error('Error stack:', error.stack);
        throw new Error(`Failed to generate summary: ${error.message}`);
    }
}

// Login user
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Find user
        const user = await db.collection('users').findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        res.json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Register new user
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Validate input
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }

        // Check if user already exists
        const existingUser = await db.collection('users').findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        await db.collection('users').insertOne({
            name,
            email,
            password: hashedPassword,
            createdAt: new Date()
        });

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Registration error:', error);
        if (error.code === 11000) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await db.collection('users').findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Create session data
    const sessionData = {
      name: user.name,
      email: user.email,
      isLoggedIn: true
    };

    res.json({ user: sessionData });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
    try {
        if (client) {
            await client.close();
            console.log('MongoDB connection closed');
        }
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});

// Summarize text endpoint
app.post('/api/summarize/text', async (req, res) => {
    try {
        const { text, length } = req.body;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: 'Text is required' });
        }

        if (text.length > 50000) { // 50KB limit for text input
            return res.status(400).json({ error: 'Text is too long' });
        }

        const summary = await generateSummary(text, length);
        res.json({ summary });
    } catch (error) {
        console.error('Summarization error:', error);
        res.status(500).json({ error: error.message || 'Error generating summary' });
    }
});

// Summarize file endpoint
app.post('/api/summarize/file', upload.single('file'), handleMulterError, async (req, res) => {
    console.log('File upload request received:', req.file);
    try {
        if (!req.file) {
            console.log('No file in request');
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log('Extracting text from file...');
        const text = await extractTextFromFile(req.file);
        console.log('Text extracted, length:', text.length);

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: 'No text could be extracted from the file' });
        }

        if (text.length > 50000) {
            return res.status(400).json({ error: 'Text is too long. Maximum length is 50,000 characters.' });
        }

        console.log('Generating summary...');
        const summary = await generateSummary(text, req.body.length);
        console.log('Summary generated, length:', summary.length);

        if (!summary || summary.trim().length === 0) {
            return res.status(500).json({ error: 'Failed to generate summary: empty response' });
        }

        res.json({ summary });
    } catch (error) {
        console.error('File processing error:', error);
        console.error('Error stack:', error.stack);

        // Send appropriate status code based on error type
        const statusCode = error.message.includes('too short') || 
                          error.message.includes('too long') || 
                          error.message.includes('Invalid file type') ? 400 : 500;

        res.status(statusCode).json({ 
            error: error.message || 'Error processing file'
        });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
}).on('error', (err) => {
    console.error('Server failed to start:', err);
});

