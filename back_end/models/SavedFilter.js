// const mongoose = require("mongoose");

// const savedFilterSchema = new mongoose.Schema({
//   userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
//   filters: { type: mongoose.Schema.Types.Mixed, default: {} },
//   createdAt: { type: Date, default: Date.now },
//   updatedAt: { type: Date, default: Date.now }
// });

// savedFilterSchema.pre("save", function (next) {
//   this.updatedAt = Date.now();
//   next();
// });

// module.exports = mongoose.model("SavedFilter", savedFilterSchema);

const mongoose = require("mongoose");

const savedFilterSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // NO unique: true
  filterName: { type: String, required: true },
  filters: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Compound index for unique filter names per user
savedFilterSchema.index({ userId: 1, filterName: 1 }, { unique: true });

savedFilterSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("SavedFilter", savedFilterSchema);