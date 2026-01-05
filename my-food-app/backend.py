from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from transformers import pipeline, AutoImageProcessor, AutoModelForImageClassification
from PIL import Image
import io

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Loading AI Model...")
model_id = "nateraw/vit-base-food101" 
processor = AutoImageProcessor.from_pretrained(model_id)
model = AutoModelForImageClassification.from_pretrained(
    model_id,
    num_labels=101,
    ignore_mismatched_sizes=True,
    use_safetensors=False
)
food_classifier = pipeline("image-classification", model=model, image_processor=processor)
print("Model Loaded Successfully!")

@app.post("/analyze")
async def analyze_image(file: UploadFile = File(...)):
    image_data = await file.read()
    image = Image.open(io.BytesIO(image_data))
    
    results = food_classifier(image)
    top_result = results[0]
    confidence = top_result['score']

    # --- DEBUGGING: Print what the AI sees to your terminal ---
    print(f"AI Detected: {top_result['label']} | Confidence: {confidence:.4f}")

    # --- ADJUSTED THRESHOLD: Lowered to 0.05 (5%) ---
    if confidence < 0.05:
        label = "Not Food"
    else:
        label = top_result['label'].replace('_', ' ').title()
    
    return {"label": label, "confidence": confidence}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)