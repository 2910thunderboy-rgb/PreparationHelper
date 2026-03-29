import mongoose from "mongoose";

const connectDB = async () => {
    const uri = process.env.MONGO_URI;
    console.log("[connectDB] Function called");
    console.log("[connectDB] MONGO_URI available:", !!uri);
    
    if (!uri) {
        console.error("[connectDB] ❌ MONGO_URI is not set");
        return false;
    }
    
    try {
        console.log("[connectDB] Attempting connection to MongoDB...");
        const conn = await mongoose.connect(uri);
        console.log(`[connectDB] ✅ MongoDB Connected: ${conn.connection.host}`);
        return true;
    } catch (error) {
        console.error(`[connectDB] ❌ MongoDB connection error: ${error.message}`);
        console.error(`[connectDB] Error details:`, error);
        return false;
    }
};

export default connectDB;