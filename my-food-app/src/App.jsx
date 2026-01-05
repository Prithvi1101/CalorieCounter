import React, { useState, useEffect } from 'react';
import { Camera, Upload, PieChart, Activity, User, ChevronRight, RotateCcw, Check, AlertCircle, Utensils, Calendar, TrendingUp, Plus, Minus } from 'lucide-react';
import { PieChart as RePie, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

// --- CONFIGURATION ---
const PYTHON_API_URL = "http://localhost:8000/analyze";
const OPEN_FOOD_FACTS_URL = "https://world.openfoodfacts.org/cgi/search.pl";

// Suggestion Logic Database
const SUGGESTIONS = {
  low_protein: ["Grilled Chicken Breast", "Greek Yogurt", "Hard Boiled Eggs", "Tofu Stir-fry", "Protein Shake"],
  low_carbs: ["Zucchini Noodles", "Cauliflower Rice", "Leafy Greens Salad", "Avocado", "Grilled Salmon"],
  low_fat: ["Oatmeal with Berries", "Baked Potato", "Rice & Beans", "Fruit Salad", "Air-popped Popcorn"],
  balanced: ["Apple slices with Almond Butter", "Hummus & Carrots", "Handful of Walnuts", "Green Tea"]
};

export default function App() {
  // --- STATE ---
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // User Profile
  const [profile, setProfile] = useState({
    gender: 'Female',
    weight: 70, // kg
    height: 170, // cm
    age: 30,
    activity: '1.2' // Sedentary
  });

  // Daily Data
  const [dailyIntake, setDailyIntake] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [mealHistory, setMealHistory] = useState([]);
  
  // Scanner
  const [selectedImage, setSelectedImage] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [portionSize, setPortionSize] = useState(100); // Default 100g
  const [nutritionData, setNutritionData] = useState(null); // Stores PER 100g values
  const [error, setError] = useState(null);
  const [selectedMealType, setSelectedMealType] = useState('Breakfast');

  // --- CALCULATIONS ---
  
  // Calculate BMR & TDEE (Calorie Goal)
  const calculateGoals = () => {
    // Mifflin-St Jeor Equation
    let bmr = (10 * profile.weight) + (6.25 * profile.height) - (5 * profile.age);
    bmr += profile.gender === 'Male' ? 5 : -161;
    
    const calories = Math.round(bmr * parseFloat(profile.activity));
    
    // Standard macro split: 30% Prot, 40% Carb, 30% Fat
    return {
      calories: calories,
      protein: Math.round((calories * 0.30) / 4),
      carbs: Math.round((calories * 0.40) / 4),
      fat: Math.round((calories * 0.30) / 9)
    };
  };

  const bmi = (profile.weight / ((profile.height/100) ** 2)).toFixed(1);
  const getBMICategory = (bmi) => {
    if (bmi < 18.5) return { label: "Underweight", color: "text-blue-500" };
    if (bmi < 25) return { label: "Healthy Weight", color: "text-green-500" };
    if (bmi < 30) return { label: "Overweight", color: "text-yellow-500" };
    return { label: "Obese", color: "text-red-500" };
  };

  const goals = calculateGoals();
  const bmiCategory = getBMICategory(bmi);

  // --- PERSISTENCE ---
  useEffect(() => {
    const savedData = localStorage.getItem('recipeasy_data');
    if (savedData) {
      const data = JSON.parse(savedData);
      setProfile(data.profile || profile);
      setMealHistory(data.mealHistory || []);
      // Recalculate daily totals from history to ensure sync
      const today = new Date().toDateString();
      const todayMeals = (data.mealHistory || []).filter(m => new Date(m.rawDate).toDateString() === today);
      const newTotals = todayMeals.reduce((acc, curr) => ({
        calories: acc.calories + curr.calories,
        protein: acc.protein + curr.protein,
        carbs: acc.carbs + curr.carbs,
        fat: acc.fat + curr.fat,
      }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
      setDailyIntake(newTotals);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('recipeasy_data', JSON.stringify({ profile, mealHistory }));
  }, [profile, mealHistory]);

  // --- HANDLERS ---

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const imageUrl = URL.createObjectURL(file);
      setSelectedImage(imageUrl);
      setAnalysisResult(null);
      setNutritionData(null);
      analyzeImage(file);
    }
  };

  const analyzeImage = async (file) => {
    setIsAnalyzing(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(PYTHON_API_URL, { method: "POST", body: formData });
      if (!response.ok) throw new Error("Check backend.py");
      const result = await response.json();
      
      if (result.label === "Not Food") {
        setAnalysisResult(null);
        setNutritionData(null);
        setError("I don't recognize this as food.");
      } else {
        setAnalysisResult({ label: result.label, confidence: result.confidence });
        await fetchNutrition(result.label);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const fetchNutrition = async (foodName) => {
    try {
      const response = await fetch(`${OPEN_FOOD_FACTS_URL}?search_terms=${foodName}&search_simple=1&action=process&json=1&page_size=1`);
      const data = await response.json();
      if (data.products && data.products.length > 0) {
        const n = data.products[0].nutriments;
        setNutritionData({
          calories: n['energy-kcal_100g'] || 0,
          protein: n.proteins_100g || 0,
          carbs: n.carbohydrates_100g || 0,
          fat: n.fat_100g || 0,
        });
      } else {
        setNutritionData({ calories: 0, protein: 0, carbs: 0, fat: 0 });
      }
    } catch (err) { setError("Nutrition data failed"); }
  };

  // Helper to get DISPLAY values based on slider
  const getCurrentValues = () => {
    if (!nutritionData) return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    const factor = portionSize / 100;
    return {
      calories: Math.round(nutritionData.calories * factor),
      protein: Math.round(nutritionData.protein * factor),
      carbs: Math.round(nutritionData.carbs * factor),
      fat: Math.round(nutritionData.fat * factor),
    };
  };

  const logMeal = () => {
    if (!nutritionData) return;
    const values = getCurrentValues();
    
    const meal = {
      id: Date.now(),
      name: analysisResult.label,
      type: selectedMealType,
      ...values,
      date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
      rawDate: new Date()
    };

    setMealHistory(prev => [meal, ...prev]);
    setDailyIntake(prev => ({
      calories: prev.calories + meal.calories,
      protein: prev.protein + meal.protein,
      carbs: prev.carbs + meal.carbs,
      fat: prev.fat + meal.fat
    }));
    setActiveTab('dashboard');
    setSelectedImage(null);
  };

  // --- UI SECTIONS ---

  const renderDashboard = () => {
    const isOver = dailyIntake.calories > goals.calories;
    const suggestion = (() => {
      const p = dailyIntake.protein / goals.protein;
      const c = dailyIntake.carbs / goals.carbs;
      const f = dailyIntake.fat / goals.fat;
      if (p < 0.5) return SUGGESTIONS.low_protein[0];
      if (c < 0.5) return SUGGESTIONS.low_carbs[0];
      if (f < 0.5) return SUGGESTIONS.low_fat[0];
      return SUGGESTIONS.balanced[0];
    })();

    const chartData = [
      { name: 'Prot', current: dailyIntake.protein, target: goals.protein, fill: '#3b82f6' },
      { name: 'Carb', current: dailyIntake.carbs, target: goals.carbs, fill: '#eab308' },
      { name: 'Fat', current: dailyIntake.fat, target: goals.fat, fill: '#ef4444' },
    ];

    return (
      <div className="space-y-6 pb-24">
        <header className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Hello!</h2>
            <p className="text-xs text-gray-500">Goal: {goals.calories} kcal • BMI: {bmi}</p>
          </div>
          <div onClick={() => setActiveTab('profile')} className="bg-gray-100 p-2 rounded-full cursor-pointer">
            <User size={20} className="text-gray-600" />
          </div>
        </header>

        {/* Calories */}
        <div className={`p-6 rounded-3xl shadow-sm border ${isOver ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100'}`}>
          <div className="flex justify-between items-center mb-4">
            <div>
              <p className="text-sm text-gray-500 font-medium">Calories Consumed</p>
              <h3 className={`text-4xl font-extrabold ${isOver ? 'text-red-600' : 'text-indigo-600'}`}>{dailyIntake.calories}</h3>
              {isOver && <span className="text-xs text-red-500 font-bold">⚠️ Over Limit!</span>}
            </div>
            <div className="w-16 h-16">
              <ResponsiveContainer width="100%" height="100%">
                <RePie>
                  <Pie data={[{ value: dailyIntake.calories }, { value: Math.max(0, goals.calories - dailyIntake.calories) }]} cx="50%" cy="50%" innerRadius={25} outerRadius={35} startAngle={90} endAngle={-270} dataKey="value">
                    <Cell fill={isOver ? '#ef4444' : '#4f46e5'} /><Cell fill="#e5e7eb" />
                  </Pie>
                </RePie>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Suggestion */}
        <div className="bg-indigo-600 p-5 rounded-2xl text-white shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} />
            <span className="text-xs font-bold uppercase opacity-80">Smart Suggestion</span>
          </div>
          <p className="text-lg font-bold">Try eating: {suggestion}</p>
          <p className="text-xs opacity-70 mt-1">Based on your remaining macros.</p>
        </div>

        {/* Macros Chart */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="font-bold text-gray-700 mb-4">Nutrient Breakdown</h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barSize={20}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12}} />
                <Tooltip cursor={{fill: 'transparent'}} />
                <Bar dataKey="current" stackId="a" radius={[4, 4, 0, 0]}>
                  {chartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Bar>
                <Bar dataKey="target" stackId="b" fill="#f3f4f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Recent Meals */}
        <div>
          <h3 className="font-bold text-gray-700 mb-3">Today's Meals</h3>
          <div className="space-y-3">
            {mealHistory.slice(0, 3).map(m => (
              <div key={m.id} className="bg-white p-3 rounded-xl border border-gray-100 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="bg-gray-100 p-2 rounded-lg"><Utensils size={16} /></div>
                  <div>
                    <p className="font-bold text-sm text-gray-800">{m.name}</p>
                    <p className="text-xs text-gray-400">{m.type}</p>
                  </div>
                </div>
                <span className="font-bold text-sm text-gray-600">{m.calories} kcal</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderProfile = () => (
    <div className="space-y-6 pb-24">
      <header><h2 className="text-2xl font-bold text-gray-800">Your Profile</h2></header>
      
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm text-center">
        <p className="text-gray-500 text-sm mb-1">Current BMI</p>
        <h1 className={`text-5xl font-black ${bmiCategory.color}`}>{bmi}</h1>
        <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold bg-gray-100 ${bmiCategory.color}`}>
          {bmiCategory.label}
        </span>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
        <h3 className="font-bold text-gray-700">Settings</h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-400 font-bold uppercase">Weight (kg)</label>
            <input type="number" value={profile.weight} onChange={e => setProfile({...profile, weight: e.target.value})} className="w-full mt-1 p-3 bg-gray-50 rounded-xl font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-xs text-gray-400 font-bold uppercase">Height (cm)</label>
            <input type="number" value={profile.height} onChange={e => setProfile({...profile, height: e.target.value})} className="w-full mt-1 p-3 bg-gray-50 rounded-xl font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-xs text-gray-400 font-bold uppercase">Age</label>
            <input type="number" value={profile.age} onChange={e => setProfile({...profile, age: e.target.value})} className="w-full mt-1 p-3 bg-gray-50 rounded-xl font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-xs text-gray-400 font-bold uppercase">Gender</label>
            <select value={profile.gender} onChange={e => setProfile({...profile, gender: e.target.value})} className="w-full mt-1 p-3 bg-gray-50 rounded-xl font-bold text-gray-800 focus:outline-none">
              <option>Male</option><option>Female</option>
            </select>
          </div>
        </div>
        
        <div>
          <label className="text-xs text-gray-400 font-bold uppercase">Activity Level</label>
          <select value={profile.activity} onChange={e => setProfile({...profile, activity: e.target.value})} className="w-full mt-1 p-3 bg-gray-50 rounded-xl font-bold text-gray-800 focus:outline-none">
            <option value="1.2">Sedentary (Office Job)</option>
            <option value="1.375">Light Exercise (1-2 days)</option>
            <option value="1.55">Moderate Exercise (3-5 days)</option>
            <option value="1.725">Heavy Exercise (6-7 days)</option>
          </select>
        </div>
      </div>
      
      <div className="text-center">
        <p className="text-xs text-gray-400">Daily Target</p>
        <p className="text-xl font-bold text-indigo-600">{goals.calories} Calories</p>
      </div>
    </div>
  );

  const renderScanner = () => {
    const currentValues = getCurrentValues();
    
    return (
      <div className="h-full flex flex-col pb-24">
        <header className="mb-4"><h2 className="text-2xl font-bold text-gray-800">Scanner</h2></header>
        <div className="flex-1 flex flex-col items-center">
          {!selectedImage ? (
             <div className="w-full max-w-md aspect-square flex flex-col items-center justify-center bg-white border-2 border-dashed border-gray-300 rounded-3xl shadow-sm relative mx-auto">
              <label className="flex flex-col items-center cursor-pointer p-10 w-full h-full justify-center">
                <div className="bg-indigo-50 p-6 rounded-full mb-4"><Camera size={40} className="text-indigo-600" /></div>
                <span className="font-semibold text-gray-600">Scan Meal</span>
                <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
              </label>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col">
              <div className="relative w-full max-w-md aspect-square mx-auto rounded-3xl overflow-hidden mb-4 shadow-md bg-black shrink-0">
                <img src={selectedImage} alt="Food" className="w-full h-full object-cover" />
                <button onClick={() => { setSelectedImage(null); setAnalysisResult(null); }} className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-full backdrop-blur-md"><RotateCcw size={16} /></button>
              </div>

              <div className="flex-1 overflow-y-auto px-1">
                {isAnalyzing ? (
                  <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center animate-pulse">
                    <p className="text-indigo-600 font-medium">Analyzing...</p>
                  </div>
                ) : error ? (
                  <div className="bg-red-50 p-4 rounded-xl text-red-600 flex items-center gap-2"><AlertCircle size={20} />{error}</div>
                ) : analysisResult && nutritionData ? (
                  <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
                    
                    {/* Header */}
                    <div className="flex justify-between items-end">
                        <div>
                            <p className="text-xs font-bold text-indigo-500 uppercase">Detected</p>
                            <h3 className="text-2xl font-bold text-gray-800 leading-none">{analysisResult.label}</h3>
                        </div>
                        <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-1 rounded-full">{Math.round(analysisResult.confidence * 100)}% Match</span>
                    </div>

                    {/* Meal Type - Added Snack */}
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {['Breakfast', 'Lunch', 'Dinner', 'Snack'].map(type => (
                        <button key={type} onClick={() => setSelectedMealType(type)} className={`px-4 py-2 text-xs font-bold rounded-full border whitespace-nowrap transition-all ${selectedMealType === type ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200'}`}>{type}</button>
                      ))}
                    </div>

                    {/* Portion Control */}
                    <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                        <div className="flex justify-between mb-2">
                            <span className="text-sm font-bold text-gray-700">Portion Size</span>
                            <span className="text-sm font-bold text-indigo-600">{portionSize}g</span>
                        </div>
                        <input 
                            type="range" min="10" max="1000" step="10" 
                            value={portionSize} 
                            onChange={(e) => setPortionSize(Number(e.target.value))} 
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                        <div className="flex justify-between mt-3 gap-2">
                            {[100, 250, 500].map(size => (
                                <button key={size} onClick={() => setPortionSize(size)} className="flex-1 py-1 text-xs font-bold bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors">{size}g</button>
                            ))}
                        </div>
                    </div>

                    {/* Live Macros */}
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="bg-orange-50 p-2 rounded-xl"><p className="text-lg font-black text-gray-800">{currentValues.calories}</p><span className="text-[10px] text-orange-600 font-bold uppercase">Kcal</span></div>
                      <div className="bg-blue-50 p-2 rounded-xl"><p className="text-lg font-black text-gray-800">{currentValues.protein}g</p><span className="text-[10px] text-blue-600 font-bold uppercase">Prot</span></div>
                      <div className="bg-yellow-50 p-2 rounded-xl"><p className="text-lg font-black text-gray-800">{currentValues.carbs}g</p><span className="text-[10px] text-yellow-600 font-bold uppercase">Carb</span></div>
                      <div className="bg-red-50 p-2 rounded-xl"><p className="text-lg font-black text-gray-800">{currentValues.fat}g</p><span className="text-[10px] text-red-600 font-bold uppercase">Fat</span></div>
                    </div>

                    <button onClick={logMeal} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all">Add to Log</button>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-md mx-auto h-screen bg-gray-50 flex flex-col font-sans text-gray-900 overflow-hidden shadow-2xl relative">
      <main className="flex-1 overflow-y-auto p-6 scroll-smooth">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'scanner' && renderScanner()}
        {activeTab === 'profile' && renderProfile()}
      </main>
      <nav className="bg-white border-t border-gray-200 px-6 py-4 flex justify-between items-center z-10 absolute bottom-0 w-full">
        <button onClick={() => setActiveTab('dashboard')} className={`${activeTab === 'dashboard' ? 'text-indigo-600' : 'text-gray-400'}`}><PieChart size={24} /><span className="text-[10px] font-medium">Daily</span></button>
        <button onClick={() => setActiveTab('scanner')} className="bg-indigo-600 text-white w-14 h-14 rounded-full flex items-center justify-center -mt-8 shadow-lg"><Camera size={28} /></button>
        <button onClick={() => setActiveTab('profile')} className={`${activeTab === 'profile' ? 'text-indigo-600' : 'text-gray-400'}`}><User size={24} /><span className="text-[10px] font-medium">Profile</span></button>
      </nav>
    </div>
  );
}