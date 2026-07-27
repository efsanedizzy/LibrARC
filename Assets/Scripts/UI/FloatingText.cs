using System;
using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace BlockPlus.UI
{
    public sealed class FloatingText : MonoBehaviour
    {
        [SerializeField] private RectTransform root;
        [SerializeField] private CanvasGroup canvasGroup;
        [SerializeField] private TMP_Text label;

        private Coroutine playRoutine;

        public void Play(string message, Color color, Vector2 startPosition, Vector2 endOffset, float duration, Action<FloatingText> onFinished)
        {
            if (playRoutine != null)
            {
                StopCoroutine(playRoutine);
            }

            gameObject.SetActive(true);
            root.anchoredPosition = startPosition;
            label.text = message;
            label.color = color;
            playRoutine = StartCoroutine(PlayRoutine(startPosition, endOffset, duration, onFinished));
        }

        private IEnumerator PlayRoutine(Vector2 startPosition, Vector2 endOffset, float duration, Action<FloatingText> onFinished)
        {
            float elapsed = 0f;
            canvasGroup.alpha = 1f;
            root.localScale = Vector3.one;

            while (elapsed < duration)
            {
                elapsed += Time.unscaledDeltaTime;
                float t = Mathf.Clamp01(elapsed / duration);
                root.anchoredPosition = Vector2.LerpUnclamped(startPosition, startPosition + endOffset, EaseOutCubic(t));
                root.localScale = Vector3.LerpUnclamped(Vector3.one, Vector3.one * 1.2f, t);
                canvasGroup.alpha = 1f - t;
                yield return null;
            }

            gameObject.SetActive(false);
            playRoutine = null;
            onFinished?.Invoke(this);
        }

        private static float EaseOutCubic(float value)
        {
            float inv = 1f - value;
            return 1f - (inv * inv * inv);
        }
    }
}
