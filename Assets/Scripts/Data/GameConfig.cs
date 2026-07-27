using UnityEngine;

namespace BlockPlus.Data
{
    [CreateAssetMenu(menuName = "BlockPlus/Game/Game Config", fileName = "GameConfig")]
    public sealed class GameConfig : ScriptableObject
    {
        [Header("Board")]
        [Min(3)] public int boardSize = 9;
        [Min(1)] public int traySize = 3;

        [Header("Scoring")]
        [Min(1)] public int scorePerBlock = 10;
        [Min(1)] public int scorePerClearedLine = 180;
        [Min(1)] public int lineClearsPerLevel = 5;

        [Header("Combo")]
        [Min(1)] public int maxCombo = 8;
        [Min(0.5f)] public float comboDecaySeconds = 5.5f;

        [Header("Continue")]
        [Min(1)] public int continueClearCellCount = 9;
        public bool allowSingleContinuePerRun = true;

        [Header("Ads")]
        [Min(1)] public int interstitialEveryGames = 3;

        [Header("Feedback")]
        [Min(0f)] public float clearFlashDuration = 0.18f;
        [Min(0f)] public float clearRemoveDelay = 0.35f;
        [Min(0f)] public float largeComboShakeAmplitude = 28f;
        [Min(0f)] public float largeComboShakeDuration = 0.22f;

        [Header("Palette")]
        public Color[] pieceColors =
        {
            new Color32(255, 23, 68, 255),
            new Color32(255, 145, 0, 255),
            new Color32(0, 230, 118, 255),
            new Color32(41, 121, 255, 255),
            new Color32(213, 0, 249, 255),
            new Color32(255, 214, 0, 255),
            new Color32(255, 64, 129, 255),
            new Color32(0, 176, 255, 255),
            new Color32(118, 255, 3, 255),
            new Color32(255, 109, 0, 255),
        };

        public Color GetRandomPieceColor()
        {
            if (pieceColors == null || pieceColors.Length == 0)
            {
                return Color.white;
            }

            return pieceColors[Random.Range(0, pieceColors.Length)];
        }

        public int GetLevelFromClears(int clearedLineCount)
        {
            return 1 + (clearedLineCount / Mathf.Max(1, lineClearsPerLevel));
        }

        public float GetComboFill01(int combo)
        {
            return Mathf.InverseLerp(1, Mathf.Max(1, maxCombo), combo);
        }
    }
}
