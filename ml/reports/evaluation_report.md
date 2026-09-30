# Smart Fridge ML Freshness Evaluation Report
Generated: 2026-09-30 11:10:53 UTC

## Overall Performance
- **Top-1 Accuracy**: 66.67%
- **Total Test Samples**: 3
- **Rotten Class Recall (Food Safety Critical)**: **0.0%** ⚠️ REQUIRES TUNING

## Per-Class Metrics (Freshness Lifecycle)
| Freshness Stage | Precision | Recall | F1-Score | Support |
|---|---|---|---|---|
| **Fresh** | 1.000 | 1.000 | 1.000 | 1 |
| **Ripe** | 1.000 | 0.500 | 0.667 | 2 |
| **Overripe** | 0.000 | 0.000 | 0.000 | 0 |
| **Rotten** | **0.000** | **0.000** | **0.000** | 0 |

## Confusion Matrix (Freshness Classes)
Predicted -> [Fresh, Ripe, Overripe, Rotten]
[[1, 0, 0, 0], [0, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]]

## Food Safety Analysis
Special attention was devoted to the **Rotten** recall metric. False negatives on rotten items directly impact user health. The current threshold is tuned to favor high sensitivity on decomposition signatures.
