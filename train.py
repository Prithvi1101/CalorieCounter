import os
from datasets import load_dataset
from transformers import (
    AutoImageProcessor, 
    AutoModelForImageClassification, 
    TrainingArguments, 
    Trainer
)
import torch
from torchvision.transforms import (
    Compose, 
    Normalize, 
    RandomResizedCrop, 
    RandomHorizontalFlip, 
    ToTensor, 
    Resize, 
    CenterCrop
)

# --- CONFIGURATION ---
# This points to the folder shown in your screenshot
# train.py configuration
DATASET_DIR = "./food-classifier-model"
MODEL_NAME = "nateraw/vit-base-food101" 
OUTPUT_DIR = "./food-classifier-model" 

# 1. Load Dataset
print(f"Loading dataset from {DATASET_DIR}...")
try:
    # This looks for folders inside 'foodd-ieee' and uses their names as labels
    dataset = load_dataset("imagefolder", data_dir=DATASET_DIR)
except Exception as e:
    print(f"\n❌ Error loading dataset: {e}")
    print(f"Please check: Does '{DATASET_DIR}' contain subfolders for each food?")
    exit()

# Split into train/test (80% train, 20% test)
# If your dataset is huge, you can lower test_size to 0.1
splits = dataset["train"].train_test_split(test_size=0.2)
train_ds = splits["train"]
test_ds = splits["test"]

# 2. Prepare Labels
labels = train_ds.features["label"].names
label2id = {label: str(i) for i, label in enumerate(labels)}
id2label = {str(i): label for i, label in enumerate(labels)}
print(f"✅ Found {len(labels)} categories: {labels}")

# 3. Image Preprocessing
processor = AutoImageProcessor.from_pretrained(MODEL_NAME)
normalize = Normalize(mean=processor.image_mean, std=processor.image_std)
size = (
    processor.size["shortest_edge"]
    if "shortest_edge" in processor.size
    else (processor.size["height"], processor.size["width"])
)

_train_transforms = Compose([
    RandomResizedCrop(size),
    RandomHorizontalFlip(),
    ToTensor(),
    normalize,
])

_val_transforms = Compose([
    Resize(size),
    CenterCrop(size),
    ToTensor(),
    normalize,
])

def train_transforms(examples):
    examples["pixel_values"] = [_train_transforms(image.convert("RGB")) for image in examples["image"]]
    del examples["image"]
    return examples

def val_transforms(examples):
    examples["pixel_values"] = [_val_transforms(image.convert("RGB")) for image in examples["image"]]
    del examples["image"]
    return examples

train_ds.set_transform(train_transforms)
test_ds.set_transform(val_transforms)

# 4. Load Model
print("Loading base model...")
model = AutoModelForImageClassification.from_pretrained(
    MODEL_NAME,
    num_labels=len(labels),
    id2label=id2label,
    label2id=label2id,
    ignore_mismatched_sizes=True 
)

# 5. Training Arguments
training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    remove_unused_columns=False,
    eval_strategy="epoch", # Updated command (was evaluation_strategy)
    save_strategy="epoch",
    learning_rate=5e-5,
    per_device_train_batch_size=16, 
    gradient_accumulation_steps=4,
    per_device_eval_batch_size=16,
    num_train_epochs=3, 
    warmup_ratio=0.1,
    logging_steps=10,
    load_best_model_at_end=True,
    metric_for_best_model="accuracy",
    save_total_limit=2, 
)

# 6. Metric
import numpy as np
import evaluate
metric = evaluate.load("accuracy")

def compute_metrics(p):
    return metric.compute(predictions=np.argmax(p.predictions, axis=1), references=p.label_ids)

# 7. Trainer
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_ds,
    eval_dataset=test_ds,
    tokenizer=processor,
    compute_metrics=compute_metrics,
)

# 8. Start Training
print("Starting training... (This may take a while!)")
trainer.train()

# 9. Save
print(f"Saving new brain to {OUTPUT_DIR}")
trainer.save_model()
trainer.save_state()