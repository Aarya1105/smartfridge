import os
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Tuple
from PIL import Image
import numpy as np
import torch
import torchvision.transforms as transforms
from app.config import settings
from app.models import ShelfLifeDefault, Zone
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

SUPPORTED_ITEMS = [
    "apple", "strawberry", "lychee", "banana", "capsicum",
    "green chilli", "coriander", "tomato", "carrot"
]

FRESHNESS_CLASSES = ["Fresh", "Ripe", "Overripe", "Rotten"]

# Default shelf lives in days for fresh state
DEFAULT_SHELF_LIFE = {
    "apple": 21,
    "strawberry": 5,
    "lychee": 7,
    "banana": 5,
    "capsicum": 10,
    "green chilli": 14,
    "coriander": 5,
    "tomato": 7,
    "carrot": 28
}

ITEM_CATEGORIES = {
    "apple": ("Fruits", "fruit", "middle_shelf"),
    "strawberry": ("Fruits", "fruit", "top_shelf"),
    "lychee": ("Fruits", "fruit", "middle_shelf"),
    "banana": ("Fruits", "fruit", "top_shelf"),
    "capsicum": ("Vegetables", "vegetable", "vegetable_drawer"),
    "green chilli": ("Vegetables", "vegetable", "vegetable_drawer"),
    "coriander": ("Vegetables", "vegetable", "vegetable_drawer"),
    "tomato": ("Vegetables", "vegetable", "middle_shelf"),
    "carrot": ("Vegetables", "vegetable", "vegetable_drawer")
}

# Image transformations for MobileNetV2
transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

class FreshnessModelService:
    def __init__(self):
        self.model = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.is_demo_mode = True
        self.load_model()

    def load_model(self):
        model_path = settings.MODEL_PATH
        if os.path.exists(model_path):
            try:
                # Load PyTorch model checkpoint
                checkpoint = torch.load(model_path, map_location=self.device)
                import torchvision.models as models
                # 9 items * 4 freshness classes = 36 total classes
                net = models.mobilenet_v2(weights=None)
                net.classifier[1] = torch.nn.Linear(net.classifier[1].in_features, 36)
                net.load_state_dict(checkpoint.get("state_dict", checkpoint))
                net.to(self.device)
                net.eval()
                self.model = net
                self.is_demo_mode = False
                logger.info("Loaded trained PyTorch MobileNetV2 freshness model successfully.")
            except Exception as e:
                logger.warning(f"Could not load custom model from {model_path}: {e}. Running in Intelligent Demo Mode.")
                self.model = None
                self.is_demo_mode = True
        else:
            logger.info(f"No custom model found at {model_path}. Running in Intelligent Demo Mode.")
            self.model = None
            self.is_demo_mode = True

    def calculate_adjusted_shelf_life(self, item_name: str, freshness: str) -> int:
        base_shelf = DEFAULT_SHELF_LIFE.get(item_name.lower(), 7)
        if freshness == "Fresh":
            return base_shelf
        elif freshness == "Ripe":
            return max(2, int(base_shelf * 0.55))
        elif freshness == "Overripe":
            return max(1, int(base_shelf * 0.25))
        else:  # Rotten
            return 0

    def predict(self, image_path: str, db: Session) -> Dict[str, Any]:
        """
        Runs image classification. If trained model exists, uses PyTorch.
        Otherwise uses color & texture computer vision heuristics for realistic demo inference.
        Returns top-3 predictions with shelf life and expiry calculations.
        """
        img = Image.open(image_path).convert("RGB")
        
        predictions: List[Dict[str, Any]] = []

        if self.model and not self.is_demo_mode:
            # Inference with PyTorch
            tensor = transform(img).unsqueeze(0).to(self.device)
            with torch.no_grad():
                output = self.model(tensor)
                probs = torch.softmax(output, dim=1)[0].cpu().numpy()
                top_indices = np.argsort(probs)[::-1][:3]

                for idx in top_indices:
                    item_idx = idx // 4
                    freshness_idx = idx % 4
                    item = SUPPORTED_ITEMS[item_idx % len(SUPPORTED_ITEMS)]
                    freshness = FRESHNESS_CLASSES[freshness_idx]
                    conf = float(probs[idx])
                    predictions.append(self._format_prediction(item, freshness, conf, db))
        else:
            # Intelligent Computer Vision Demo Mode
            # Analyze dominant color & variance to make realistic predictions
            img_arr = np.array(img.resize((64, 64)))
            r, g, b = img_arr[:, :, 0].mean(), img_arr[:, :, 1].mean(), img_arr[:, :, 2].mean()
            std_val = img_arr.std()

            # Guess item from colors
            if r > 140 and g < 90 and b < 90:
                guessed_item = "tomato" if r > 160 else "apple"
            elif r > 140 and g > 130 and b < 90:
                guessed_item = "banana"
            elif r < 100 and g > 110:
                guessed_item = "coriander" if std_val > 45 else "capsicum"
            elif r > 130 and g > 80 and b < 60:
                guessed_item = "carrot"
            elif r > 120 and b > 80 and g < 90:
                guessed_item = "strawberry"
            else:
                # Default rotation based on hash or file name
                h = abs(hash(os.path.basename(image_path)))
                guessed_item = SUPPORTED_ITEMS[h % len(SUPPORTED_ITEMS)]

            # Guess freshness
            # Darker or lower contrast often correlates with decay/browning
            if std_val < 25 or (r < 60 and g < 60 and b < 60):
                guessed_freshness = "Rotten"
                conf = 0.88
            elif r > 150 and g > 120 and guessed_item == "banana":
                guessed_freshness = "Ripe"
                conf = 0.91
            else:
                guessed_freshness = "Fresh"
                conf = 0.94

            top = self._format_prediction(guessed_item, guessed_freshness, conf, db)
            predictions.append(top)

            # Runner-ups
            alt_freshness = "Ripe" if guessed_freshness == "Fresh" else "Fresh"
            alt_item = "apple" if guessed_item != "apple" else "tomato"
            predictions.append(self._format_prediction(guessed_item, alt_freshness, round(conf * 0.45, 2), db))
            predictions.append(self._format_prediction(alt_item, "Fresh", round(conf * 0.25, 2), db))

        return {
            "top_prediction": predictions[0],
            "all_predictions": predictions,
            "image_url": f"/storage/uploads/{os.path.basename(image_path)}",
            "is_demo_mode": self.is_demo_mode,
            "disclaimer": "Freshness predictions are assistive and not a food safety guarantee."
        }

    def _format_prediction(self, item_name: str, freshness: str, confidence: float, db: Session) -> Dict[str, Any]:
        cat, item_type, rec_zone_code = ITEM_CATEGORIES.get(item_name.lower(), ("Vegetables", "vegetable", "vegetable_drawer"))
        
        # Check custom DB zone or shelf life if present
        shelf_default = db.query(ShelfLifeDefault).filter(ShelfLifeDefault.item_name == item_name.lower()).first()
        base_shelf = shelf_default.typical_shelf_life_days if shelf_default else DEFAULT_SHELF_LIFE.get(item_name.lower(), 7)
        if shelf_default:
            rec_zone_code = shelf_default.recommended_zone_code

        # Zone lookup
        zone = db.query(Zone).filter(Zone.code == rec_zone_code).first() or db.query(Zone).first()
        
        # Adjusted shelf life
        adj_shelf = self.calculate_adjusted_shelf_life(item_name, freshness)
        expiry_date = datetime.utcnow() + timedelta(days=adj_shelf)

        return {
            "item_name": item_name.capitalize(),
            "freshness_class": freshness,
            "confidence": round(confidence, 3),
            "typical_shelf_life_days": adj_shelf,
            "suggested_expiry_date": expiry_date,
            "suggested_zone_id": zone.id if zone else 1,
            "suggested_zone_name": zone.name if zone else "Vegetable Drawer",
            "category": cat,
            "item_type": item_type,
            "needs_manual_check": confidence < 0.60
        }

ml_service = FreshnessModelService()
