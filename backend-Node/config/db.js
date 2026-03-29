import mongoose from "mongoose";

const connectDB = async () => {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error("MONGO_URI is not set. Add your Atlas connection string to backend-Node/.env");
        process.exit(1);
    }
    try {
        const conn = await mongoose.connect(uri);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`MongoDB connection error: ${error.message}`);
        process.exit(1);
    }
};

export default connectDB;