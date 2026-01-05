import os
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

import streamlit as st
from transformers import pipeline, AutoImageProcessor, AutoModelForImageClassification
from huggingface_hub import snapshot_download
from PIL import Image
import requests
import pandas as pd
import datetime

# Model setup (using your preferred nateraw/vit-base-food101)
local_model_dir = "models/vit-base-food101"
if not os.path.exists(local_model_dir):
    os.makedirs(local_model_dir, exist_ok=True)
    snapshot_download(repo_id="nateraw/vit-base-food101", local_dir=local_model_dir)

# Load model components
processor = AutoImageProcessor.from_pretrained(local_model_dir)
model = AutoModelForImageClassification.from_pretrained(
    local_model_dir,
    num_labels=101,
    ignore_mismatched_sizes=True,
    use_safetensors=False
)
food_classifier = pipeline("image-classification", model=model, image_processor=processor, top_k=5)

# Nutrition setup (USDA + Open Food Facts integration)
USDA_API_KEY = "ShNOIt6Hx7BIN8D1BXqrJi4L6YoKS3p8sHis2Ad9"

def get_nutrition(food_name, portion_grams=100):
    """Fetch from USDA first, then Open Food Facts if needed. Scales to portion."""
    nutrition = {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0, 'allergens': 'none'}
    
    # USDA fallback
    try:
        url = f"https://api.nal.usda.gov/fdc/v1/foods/search?query={food_name}&api_key={USDA_API_KEY}"
        response = requests.get(url)
        if response.status_code == 200:
            data = response.json()
            if 'foods' in data and data['foods']:
                nutrients = data['foods'][0]['foodNutrients']
                calories = next((n['value'] for n in nutrients if 'Energy' in n['nutrientName']), 0)
                protein = next((n['value'] for n in nutrients if 'Protein' in n['nutrientName']), 0)
                carbs = next((n['value'] for n in nutrients if 'Carbohydrate' in n['nutrientName']), 0)
                fat = next((n['value'] for n in nutrients if 'lipid' in n['nutrientName']), 0)
                factor = portion_grams / 100
                nutrition = {
                    'calories': round(calories * factor, 1),
                    'protein': round(protein * factor, 1),
                    'carbs': round(carbs * factor, 1),
                    'fat': round(fat * factor, 1),
                    'allergens': 'unknown'
                }
                if nutrition['calories'] > 0:
                    return nutrition  # Success, no need for OFF
        else:
            st.error(f"USDA API error: Status {response.status_code}")
    except Exception as e:
        st.error(f"USDA API error: {e}")
    
    # Open Food Facts fallback if USDA fails or zeros
    try:
        off_url = f"https://world.openfoodfacts.org/cgi/search.pl?search_terms={food_name}&search_simple=1&json=1&page_size=1"
        off_response = requests.get(off_url)
        if off_response.status_code == 200:
            off_data = off_response.json()
            if 'products' in off_data and off_data['products']:
                product = off_data['products'][0]
                calories = product.get('nutriments', {}).get('energy-kcal_100g', 0)
                protein = product.get('nutriments', {}).get('proteins_100g', 0)
                carbs = product.get('nutriments', {}).get('carbohydrates_100g', 0)
                fat = product.get('nutriments', {}).get('fat_100g', 0)
                allergens = product.get('allergens', 'unknown')
                factor = portion_grams / 100
                nutrition = {
                    'calories': round(calories * factor, 1),
                    'protein': round(protein * factor, 1),
                    'carbs': round(carbs * factor, 1),
                    'fat': round(fat * factor, 1),
                    'allergens': allergens if allergens else 'unknown'
                }
    except Exception as e:
        st.error(f"Open Food Facts API error: {e}")
    
    return nutrition

# Simple meal plan suggestions (hardcoded for simplicity; can expand)
meal_plans = {
    'breakfast': ['Oatmeal with fruits', 'Eggs and toast', 'Smoothie bowl'],
    'lunch': ['Grilled chicken salad', 'Veggie stir-fry', 'Quinoa bowl'],
    'dinner': ['Baked salmon with veggies', 'Pasta primavera', 'Stir-fried tofu']
}

# Daily recommended macros (based on gender; simple averages)
def get_daily_recommended(gender):
    if gender == 'Male':
        return {'calories': 2500, 'protein': 56, 'carbs': 325, 'fat': 95}
    else:
        return {'calories': 2000, 'protein': 46, 'carbs': 260, 'fat': 75}

# Streamlit UI
st.title("Recipeasy Calorie & Nutrition Estimator")

# Gender selection for recommendations
gender = st.selectbox("Select your gender for personalized recommendations", ["Male", "Female"])

# Initialize session state for daily intake, last meal, hydration
if 'daily_intake' not in st.session_state:
    st.session_state.daily_intake = {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0}
if 'last_meal' not in st.session_state:
    st.session_state.last_meal = None
if 'hydration_reminded' not in st.session_state:
    st.session_state.hydration_reminded = False

uploaded_file = st.file_uploader("Upload a food image", type=["jpg", "png", "jpeg"])
portion_grams = st.slider("Portion size (grams)", min_value=50, max_value=500, value=200)

if uploaded_file:
    img = Image.open(uploaded_file)
    st.image(img, caption="Uploaded Image", use_column_width=True)

    with st.spinner("Analyzing..."):
        class_results = food_classifier(img)
        top_food = class_results[0]['label'].replace('_', ' ')
        conf = class_results[0]['score']

        nutrition = get_nutrition(top_food, portion_grams)

    st.subheader("Recognition")
    st.write(f"**Food:** {top_food} (Confidence: {conf:.2f})")

    if conf < 0.5:
        st.warning("Low confidence. Alternatives:")
        for res in class_results[1:]:
            st.write(f"- {res['label'].replace('_', ' ')} (conf: {res['score']:.2f})")

    st.subheader("Nutrition (per portion)")
    nutrient_df = pd.DataFrame({
        "Nutrient": ["Calories (kcal)", "Protein (g)", "Carbs (g)", "Fat (g)"],
        "Value": [nutrition['calories'], nutrition['protein'], nutrition['carbs'], nutrition['fat']]
    })
    st.table(nutrient_df)

    if nutrition['allergens'] != 'none' and nutrition['allergens'] != 'unknown':
        st.warning(f"Allergens: {nutrition['allergens']}")
    elif nutrition['allergens'] == 'unknown':
        st.info("Allergens: Unknown (check packaging)")

    # Update daily intake and last meal
    if st.button("Log this meal"):
        st.session_state.daily_intake['calories'] += nutrition['calories']
        st.session_state.daily_intake['protein'] += nutrition['protein']
        st.session_state.daily_intake['carbs'] += nutrition['carbs']
        st.session_state.daily_intake['fat'] += nutrition['fat']
        st.session_state.last_meal = top_food
        st.success("Meal logged!")

# Daily chart
st.subheader("Daily Macro Progress")
recommended = get_daily_recommended(gender)
consumed_df = pd.DataFrame({
    "Macro": ["Calories", "Protein", "Carbs", "Fat"],
    "Consumed": [st.session_state.daily_intake['calories'], st.session_state.daily_intake['protein'], st.session_state.daily_intake['carbs'], st.session_state.daily_intake['fat']],
    "Recommended": [recommended['calories'], recommended['protein'], recommended['carbs'], recommended['fat']],
    "Remaining": [max(0, recommended['calories'] - st.session_state.daily_intake['calories']), 
                  max(0, recommended['protein'] - st.session_state.daily_intake['protein']), 
                  max(0, recommended['carbs'] - st.session_state.daily_intake['carbs']), 
                  max(0, recommended['fat'] - st.session_state.daily_intake['fat'])]
})
st.bar_chart(consumed_df.set_index("Macro")[["Consumed", "Remaining"]])

# Meal recommendations
st.subheader("Meal Recommendations")
meal_type = st.selectbox("Select meal type", ["Breakfast", "Lunch", "Dinner"])
if st.button("Get Suggestion"):
    suggestions = meal_plans.get(meal_type.lower(), [])
    if suggestions:
        suggestion = suggestions[0] if st.session_state.last_meal is None else suggestions[1]  # Simple variety
        st.write(f"Suggested {meal_type}: {suggestion}")

# Hydration reminder (simple time-based)
current_hour = datetime.datetime.now().hour
if current_hour % 3 == 0 and not st.session_state.hydration_reminded:
    st.info("Hydration Reminder: Drink a glass of water!")
    st.session_state.hydration_reminded = True

# Reset daily intake
if st.button("Reset Daily Intake"):
    st.session_state.daily_intake = {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0}
    st.session_state.last_meal = None
    st.session_state.hydration_reminded = False
    st.success("Daily intake reset!")