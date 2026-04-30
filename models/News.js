const mongoose = require("mongoose");

const newsSchema = new mongoose.Schema({
    img: {
        filename: String,
        contentType: String,
        id: mongoose.Schema.Types.ObjectId
    },
    title: { type: String, required: true },
    data: { type: String, required: true }
},{timestamps: true}
);

module.exports = mongoose.model("News", newsSchema);