const mongoose = require("mongoose");

const listItemSchema = new mongoose.Schema(
  {
    listId: { type: mongoose.Schema.Types.ObjectId, ref: "List", required: true },
    status: { type: String, default: "" },
    raw: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    strict: false, 
  }
);

listItemSchema.index({ listId: 1 });
listItemSchema.index({ listId: 1, "raw.public_identifier": 1 });
listItemSchema.index({ "raw.public_identifier": 1 });
listItemSchema.index({ "raw.public_profile_url": 1 });
listItemSchema.index({ "raw.linkedin_url": 1 });

module.exports = mongoose.model("ListItem", listItemSchema);

