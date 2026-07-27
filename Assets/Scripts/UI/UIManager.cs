using System.Collections;
using System.Collections.Generic;
using BlockPlus.Core;
using TMPro;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;

namespace BlockPlus.UI
{
    public sealed class UIManager : MonoBehaviour
    {
        [Header("HUD")]
        [SerializeField] private TMP_Text scoreText;
        [SerializeField] private TMP_Text bestScoreText;
        [SerializeField] private TMP_Text comboText;
        [SerializeField] private TMP_Text levelText;
        [SerializeField] private Image comboFill;

        [Header("Game Over")]
        [SerializeField] private CanvasGroup gameOverPanel;
        [SerializeField] private TMP_Text gameOverScoreText;
        [SerializeField] private GameObject newBestBadge;
        [SerializeField] private Button continueButton;
        [SerializeField] private Button restartButton;
        [SerializeField] private Button menuButton;

        [Header("Feedback")]
        [SerializeField] private RectTransform feedbackLayer;
        [SerializeField] private RectTransform floatingScoreAnchor;
        [SerializeField] private RectTransform comboPopupAnchor;
        [SerializeField] private FloatingText floatingTextPrefab;
        [SerializeField] private ScreenFader screenFader;

        private readonly Queue<FloatingText> floatingPool = new Queue<FloatingText>();
        private readonly List<FloatingText> activeFloatingTexts = new List<FloatingText>(8);

        public ScreenFader ScreenFader => screenFader;

        public void Initialize(GameManager gameManager)
        {
            // Buttons are connected in code so scene wiring stays simple and explicit.
            continueButton.onClick.RemoveAllListeners();
            continueButton.onClick.AddListener(gameManager.RequestContinue);

            restartButton.onClick.RemoveAllListeners();
            restartButton.onClick.AddListener(gameManager.StartNewGame);

            menuButton.onClick.RemoveAllListeners();
            menuButton.onClick.AddListener(gameManager.ReturnToMenu);

            HideGameOverImmediate();
        }

        public void SetHud(int score, int bestScore, int combo, int level, float comboFill01)
        {
            scoreText.text = score.ToString("N0");
            bestScoreText.text = bestScore.ToString("N0");
            comboText.text = $"x{combo}";
            levelText.text = level.ToString();
            comboFill.fillAmount = comboFill01;
        }

        public void ShowFloatingScore(int amount, Color color)
        {
            FloatingText text = GetFloatingText();
            text.Play($"+{amount:N0}", color, floatingScoreAnchor.anchoredPosition, new Vector2(0f, 120f), 1f, ReturnFloatingText);
        }

        public void ShowComboPopup(int combo, Color color)
        {
            FloatingText text = GetFloatingText();
            text.transform.SetAsLastSibling();
            text.Play($"{combo}x COMBO!", color, comboPopupAnchor.anchoredPosition, new Vector2(0f, 90f), 1.05f, ReturnFloatingText);
        }

        public void ShowGameOver(int score, bool isNewBest, bool canContinue)
        {
            gameOverPanel.alpha = 1f;
            gameOverPanel.blocksRaycasts = true;
            gameOverPanel.interactable = true;
            gameOverScoreText.text = score.ToString("N0");
            newBestBadge.SetActive(isNewBest);
            continueButton.gameObject.SetActive(canContinue);
        }

        public void HideGameOverImmediate()
        {
            gameOverPanel.alpha = 0f;
            gameOverPanel.blocksRaycasts = false;
            gameOverPanel.interactable = false;
        }

        public IEnumerator FadeAndLoadScene(string sceneName)
        {
            if (screenFader != null)
            {
                yield return screenFader.FadeOutRoutine();
            }

            SceneManager.LoadScene(sceneName);
        }

        private FloatingText GetFloatingText()
        {
            FloatingText instance = floatingPool.Count > 0 ? floatingPool.Dequeue() : Instantiate(floatingTextPrefab, feedbackLayer);
            activeFloatingTexts.Add(instance);
            return instance;
        }

        private void ReturnFloatingText(FloatingText floatingText)
        {
            activeFloatingTexts.Remove(floatingText);
            floatingPool.Enqueue(floatingText);
        }
    }
}
