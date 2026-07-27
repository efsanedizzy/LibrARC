using System.Collections;
using BlockPlus.Ads;
using BlockPlus.Audio;
using BlockPlus.Board;
using BlockPlus.Data;
using BlockPlus.Effects;
using BlockPlus.Infrastructure;
using BlockPlus.Input;
using BlockPlus.Pieces;
using BlockPlus.UI;
using UnityEngine;

namespace BlockPlus.Core
{
    public sealed class GameManager : MonoBehaviour
    {
        [SerializeField] private string mainMenuSceneName = "MainMenu";
        [SerializeField] private GameConfig config;
        [SerializeField] private BoardManager boardManager;
        [SerializeField] private PieceManager pieceManager;
        [SerializeField] private InputManager inputManager;
        [SerializeField] private UIManager uiManager;
        [SerializeField] private EffectPool effectPool;
        [SerializeField] private ScreenShake screenShake;
        [SerializeField] private AudioManager audioManager;
        [SerializeField] private AdsManager adsManager;

        private int score;
        private int bestScore;
        private int combo;
        private int level;
        private int clearedLineCount;
        private bool gameOver;
        private bool busy;
        private bool continueUsed;
        private float comboExpireTime;

        private void Start()
        {
            // Managers can be shared across scenes, so the scene reference wins and the singleton is a fallback.
            audioManager = audioManager != null ? audioManager : AudioManager.Instance;
            adsManager = adsManager != null ? adsManager : AdsManager.Instance;
            bestScore = SaveService.LoadBestScore();

            if (!ValidateReferences())
            {
                enabled = false;
                return;
            }

            boardManager.Initialize(config);
            uiManager.Initialize(this);
            pieceManager.Initialize(config, inputManager);

            if (uiManager.ScreenFader != null)
            {
                StartCoroutine(uiManager.ScreenFader.FadeInRoutine());
            }

            if (adsManager != null)
            {
                adsManager.InitializeAds();
            }

            StartNewGame();
        }

        private void Update()
        {
            if (!gameOver && combo > 1 && Time.unscaledTime >= comboExpireTime)
            {
                combo = 1;
                RefreshHud();
            }
        }

        private void OnApplicationPause(bool pauseStatus)
        {
            if (pauseStatus)
            {
                SaveService.SaveBestScore(bestScore);
            }
        }

        private void OnApplicationFocus(bool hasFocus)
        {
            if (!hasFocus)
            {
                SaveService.SaveBestScore(bestScore);
            }
        }

        public void StartNewGame()
        {
            // A fresh run resets only gameplay state. Persistent settings stay in PlayerPrefs.
            score = 0;
            combo = 1;
            level = 1;
            clearedLineCount = 0;
            busy = false;
            gameOver = false;
            continueUsed = false;
            comboExpireTime = 0f;

            boardManager.ResetBoard();
            pieceManager.ResetTray();
            pieceManager.FillEmptySlots();
            uiManager.HideGameOverImmediate();
            RefreshHud();
        }

        public bool TryBeginDrag(PieceView view, out RuntimePiece piece)
        {
            piece = null;

            if (busy || gameOver)
            {
                return false;
            }

            return pieceManager.TryGetPiece(view, out piece);
        }

        public bool TryPlaceDraggedPiece(PieceView view, Vector2Int anchor)
        {
            if (busy || gameOver || !pieceManager.TryGetPiece(view, out RuntimePiece piece))
            {
                return false;
            }

            StartCoroutine(ResolvePlacementRoutine(view, piece, anchor));
            return true;
        }

        public void RequestContinue()
        {
            if (!gameOver || busy || (config.allowSingleContinuePerRun && continueUsed))
            {
                return;
            }

            busy = true;

            if (adsManager == null)
            {
                OnRewardedContinueResult(true);
                return;
            }

            adsManager.ShowRewarded(OnRewardedContinueResult);
        }

        public void ReturnToMenu()
        {
            if (!isActiveAndEnabled)
            {
                return;
            }

            StartCoroutine(uiManager.FadeAndLoadScene(mainMenuSceneName));
        }

        private IEnumerator ResolvePlacementRoutine(PieceView view, RuntimePiece piece, Vector2Int anchor)
        {
            busy = true;

            // BoardManager owns placement validation and line detection.
            BoardPlacementResult result = boardManager.PlacePiece(piece, anchor);
            if (!result.Success)
            {
                busy = false;
                view.ReturnToHomeAnimated();
                yield break;
            }

            pieceManager.RemovePiece(view);
            PlayPlacementEffects(result);

            // Combo increases only when at least one full line clears.
            if (result.ClearedLineCount > 0)
            {
                combo = Mathf.Min(combo + 1, config.maxCombo);
                comboExpireTime = Time.unscaledTime + config.comboDecaySeconds;
            }
            else
            {
                combo = 1;
            }

            clearedLineCount += result.ClearedLineCount;
            level = config.GetLevelFromClears(clearedLineCount);

            int points = CalculatePlacementScore(piece.CellCount, result.ClearedLineCount);
            score += points;
            if (score > bestScore)
            {
                bestScore = score;
                SaveService.SaveBestScore(bestScore);
            }

            RefreshHud();
            uiManager.ShowFloatingScore(points, result.ClearedLineCount > 0 ? new Color32(0, 230, 118, 255) : Color.white);

            if (audioManager != null)
            {
                if (result.ClearedLineCount > 0)
                {
                    audioManager.PlayClear();
                }
                else
                {
                    audioManager.PlayPlace();
                }
            }

            if (result.ClearedLineCount > 0)
            {
                // We wait for the clear animation before refilling the tray so the feedback feels intentional.
                PlayClearEffects(result);
                yield return boardManager.AnimateClearRoutine(result);

                if (combo >= 3)
                {
                    uiManager.ShowComboPopup(combo, GetComboColor(combo));
                    if (audioManager != null)
                    {
                        audioManager.PlayCombo();
                    }
                }

                if (combo >= 4 && screenShake != null)
                {
                    screenShake.Shake(config.largeComboShakeAmplitude, config.largeComboShakeDuration);
                }
            }

            if (pieceManager.AreAllSlotsEmpty())
            {
                pieceManager.FillEmptySlots();
            }

            RefreshHud();
            busy = false;

            if (!boardManager.HasAnyValidMove(pieceManager.TrayPieces))
            {
                HandleGameOver();
            }
        }

        private void HandleGameOver()
        {
            gameOver = true;
            bool isNewBest = score >= bestScore && score > 0;
            bool canContinue = (!config.allowSingleContinuePerRun || !continueUsed) && (adsManager == null || adsManager.RewardedAvailable);
            uiManager.ShowGameOver(score, isNewBest, canContinue);

            int totalGames = SaveService.IncrementLifetimeGames();
            if (adsManager != null && totalGames % Mathf.Max(1, config.interstitialEveryGames) == 0)
            {
                adsManager.ShowInterstitialIfReady();
            }
        }

        private void OnRewardedContinueResult(bool success)
        {
            if (!success)
            {
                busy = false;
                return;
            }

            // The rewarded continue clears some occupied cells and gives the player a fresh tray.
            continueUsed = true;
            gameOver = false;
            combo = 1;
            busy = false;
            uiManager.HideGameOverImmediate();

            var clearedCells = boardManager.ClearRandomOccupiedCells(config.continueClearCellCount);
            for (int index = 0; index < clearedCells.Count; index++)
            {
                if (effectPool != null)
                {
                    effectPool.Play(EffectType.Clear, boardManager.GetCellWorldPosition(clearedCells[index]));
                }
            }

            pieceManager.ResetTray();
            pieceManager.FillEmptySlots();
            RefreshHud();

            if (!boardManager.HasAnyValidMove(pieceManager.TrayPieces))
            {
                HandleGameOver();
            }
        }

        private void RefreshHud()
        {
            uiManager.SetHud(score, bestScore, combo, level, config.GetComboFill01(combo));
        }

        private int CalculatePlacementScore(int blockCount, int clearedLines)
        {
            int baseScore = blockCount * config.scorePerBlock * level;
            int bonusScore = clearedLines * config.scorePerClearedLine * combo * level;
            return baseScore + bonusScore;
        }

        private void PlayPlacementEffects(BoardPlacementResult result)
        {
            if (effectPool == null)
            {
                return;
            }

            for (int index = 0; index < result.PlacedCells.Count; index++)
            {
                effectPool.Play(EffectType.Place, boardManager.GetCellWorldPosition(result.PlacedCells[index]));
            }
        }

        private void PlayClearEffects(BoardPlacementResult result)
        {
            if (effectPool == null)
            {
                return;
            }

            for (int index = 0; index < result.ClearedCells.Count; index++)
            {
                effectPool.Play(EffectType.Clear, boardManager.GetCellWorldPosition(result.ClearedCells[index]));
            }

            if (result.ClearedLineCount >= 2)
            {
                effectPool.Play(EffectType.ComboBurst, boardManager.GetCellWorldPosition(result.ClearedCells[result.ClearedCells.Count / 2]));
            }
        }

        private static Color GetComboColor(int combo)
        {
            switch (combo)
            {
                case 3:
                    return new Color32(255, 145, 0, 255);
                case 4:
                    return new Color32(255, 23, 68, 255);
                case 5:
                    return new Color32(213, 0, 249, 255);
                case 6:
                    return new Color32(255, 214, 0, 255);
                case 7:
                    return new Color32(0, 230, 118, 255);
                default:
                    return new Color32(0, 176, 255, 255);
            }
        }

        private bool ValidateReferences()
        {
            bool valid = true;

            if (config == null)
            {
                Debug.LogError("GameManager is missing GameConfig.");
                valid = false;
            }

            if (boardManager == null)
            {
                Debug.LogError("GameManager is missing BoardManager.");
                valid = false;
            }

            if (pieceManager == null)
            {
                Debug.LogError("GameManager is missing PieceManager.");
                valid = false;
            }

            if (inputManager == null)
            {
                Debug.LogError("GameManager is missing InputManager.");
                valid = false;
            }

            if (uiManager == null)
            {
                Debug.LogError("GameManager is missing UIManager.");
                valid = false;
            }

            return valid;
        }
    }
}
