const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    date: { type: Date, required: true },
    toDate : { type: Date, default: null }
},{timestamps: true}
);
module.exports = mongoose.model("Event", eventSchema);