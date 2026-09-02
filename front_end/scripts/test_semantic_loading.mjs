
import semanticFilterManager from '../src/utils/semanticFilter.js';

async function test() {
  console.log("Testing Semantic Filter Manager...");
  try {
    const available = await semanticFilterManager.checkAvailability();
    console.log("Transformers Available:", available);
    
    if (available) {
      await semanticFilterManager.initializeModel();
      console.log("Model Initialized");
      const embedding = await semanticFilterManager.getEmbedding("CEO");
      console.log("Embedding generated, length:", embedding.length);
      
      const score = await semanticFilterManager.calculateSimilarity("CEO", "Chief Executive Officer");
      console.log("Similarity (CEO vs Chief Executive Officer):", score);
    } else {
      console.log("Falling back to simple similarity.");
      const score = await semanticFilterManager.calculateSimilarity("CEO", "Chief Executive Officer");
      console.log("Simple Similarity:", score);
    }
  } catch (error) {
    console.error("Error during test:", error);
  }
}

test();
