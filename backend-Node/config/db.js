import mongoose from "mongoose";

const connectDB = async () => {
    const uri = process.env.MONGO_URI;
    console.log("[connectDB] Function called");
    console.log("[connectDB] MONGO_URI available:", !!uri);
    console.log("[connectDB] NODE_ENV:", process.env.NODE_ENV);
    console.log("[connectDB] URI starts with:", uri ? uri.substring(0, 20) + "..." : "none");

    if (!uri) {
        console.error("[connectDB] ❌ MONGO_URI is not set");
        throw new Error("MONGO_URI is not set")
    }

    const maxRetries = 3
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
        try {
            console.log(`[connectDB] Attempt ${attempt} connecting to MongoDB...`);
            const conn = await mongoose.connect(uri, {
                serverSelectionTimeoutMS: 10000,
                connectTimeoutMS: 10000,
            });
            console.log(`[connectDB] ✅ MongoDB Connected: ${conn.connection.host}`);
            return true;
        } catch (error) {
            console.error(`[connectDB] ❌ MongoDB connection error (attempt ${attempt}): ${error.message}`);
            console.error(`[connectDB] Full error:`, JSON.stringify(error, null, 2));
            if (attempt === maxRetries) {
                console.error(`[connectDB] ❌ All ${maxRetries} attempts failed.`);
                throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 1500));
        }
    }

    return false;
};

export default connectDB;