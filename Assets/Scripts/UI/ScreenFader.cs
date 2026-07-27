using System.Collections;
using UnityEngine;
using UnityEngine.UI;

namespace BlockPlus.UI
{
    public sealed class ScreenFader : MonoBehaviour
    {
        [SerializeField] private CanvasGroup canvasGroup;
        [SerializeField] private float defaultDuration = 0.25f;

        private void Awake()
        {
            canvasGroup.alpha = 1f;
            canvasGroup.blocksRaycasts = true;
        }

        public void ShowImmediate()
        {
            canvasGroup.alpha = 1f;
            canvasGroup.blocksRaycasts = true;
        }

        public void HideImmediate()
        {
            canvasGroup.alpha = 0f;
            canvasGroup.blocksRaycasts = false;
        }

        public IEnumerator FadeInRoutine()
        {
            yield return FadeRoutine(1f, 0f, defaultDuration);
        }

        public IEnumerator FadeOutRoutine()
        {
            yield return FadeRoutine(0f, 1f, defaultDuration);
        }

        private IEnumerator FadeRoutine(float from, float to, float duration)
        {
            canvasGroup.blocksRaycasts = true;
            float elapsed = 0f;

            while (elapsed < duration)
            {
                elapsed += Time.unscaledDeltaTime;
                float t = duration <= 0f ? 1f : elapsed / duration;
                canvasGroup.alpha = Mathf.Lerp(from, to, t);
                yield return null;
            }

            canvasGroup.alpha = to;
            canvasGroup.blocksRaycasts = to > 0.01f;
        }
    }
}
