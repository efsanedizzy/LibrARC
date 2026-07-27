using System.Collections;
using UnityEngine;
using UnityEngine.UI;

namespace BlockPlus.Board
{
    public sealed class BoardCellView : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private Image backgroundImage;
        [SerializeField] private Image fillImage;
        [SerializeField] private Image glowImage;
        [SerializeField] private Image previewImage;
        [SerializeField] private RectTransform scaleRoot;

        [Header("Colors")]
        [SerializeField] private Color emptyBackground = new Color32(10, 10, 36, 255);
        [SerializeField] private Color validPreviewColor = new Color(1f, 1f, 1f, 0.32f);
        [SerializeField] private Color invalidPreviewColor = new Color(1f, 0.2f, 0.32f, 0.7f);

        private Coroutine currentAnimation;

        public RectTransform RectTransform => (RectTransform)transform;

        public void SetEmpty()
        {
            backgroundImage.color = emptyBackground;
            fillImage.enabled = false;
            glowImage.enabled = false;
            ClearPreview();
            ResetScale();
        }

        public void SetFilled(Color color)
        {
            backgroundImage.color = Color.Lerp(color, Color.black, 0.35f);
            fillImage.enabled = true;
            fillImage.color = color;
            glowImage.enabled = true;
            glowImage.color = new Color(color.r, color.g, color.b, 0.45f);
            ClearPreview();
            ResetScale();
        }

        public void SetPreview(Color color, bool valid)
        {
            previewImage.enabled = true;
            previewImage.color = valid ? new Color(color.r, color.g, color.b, validPreviewColor.a) : invalidPreviewColor;
        }

        public void ClearPreview()
        {
            previewImage.enabled = false;
        }

        public void PlayPlacementAnimation()
        {
            PlayScaleAnimation(0.82f, 1.06f, 1f, 0.12f);
        }

        public void PlayFlashAnimation(float duration)
        {
            if (currentAnimation != null)
            {
                StopCoroutine(currentAnimation);
            }

            currentAnimation = StartCoroutine(FlashRoutine(duration));
        }

        public void PlayClearAnimation(float duration)
        {
            PlayScaleAnimation(1f, 1.18f, 0f, duration);
        }

        private void PlayScaleAnimation(float from, float peak, float target, float duration)
        {
            if (currentAnimation != null)
            {
                StopCoroutine(currentAnimation);
            }

            currentAnimation = StartCoroutine(ScaleRoutine(from, peak, target, duration));
        }

        private IEnumerator FlashRoutine(float duration)
        {
            Color startColor = fillImage.enabled ? fillImage.color : backgroundImage.color;
            Color flashColor = Color.Lerp(startColor, Color.white, 0.65f);
            float elapsed = 0f;

            while (elapsed < duration)
            {
                elapsed += Time.unscaledDeltaTime;
                float t = Mathf.PingPong(elapsed * 8f, 1f);
                if (fillImage.enabled)
                {
                    fillImage.color = Color.Lerp(startColor, flashColor, t);
                }

                yield return null;
            }

            if (fillImage.enabled)
            {
                fillImage.color = startColor;
            }

            currentAnimation = null;
        }

        private IEnumerator ScaleRoutine(float from, float peak, float target, float duration)
        {
            float halfDuration = duration * 0.5f;
            float elapsed = 0f;
            scaleRoot.localScale = Vector3.one * from;

            while (elapsed < halfDuration)
            {
                elapsed += Time.unscaledDeltaTime;
                float t = halfDuration <= 0f ? 1f : elapsed / halfDuration;
                scaleRoot.localScale = Vector3.one * Mathf.Lerp(from, peak, EaseOutBack(t));
                yield return null;
            }

            elapsed = 0f;
            while (elapsed < halfDuration)
            {
                elapsed += Time.unscaledDeltaTime;
                float t = halfDuration <= 0f ? 1f : elapsed / halfDuration;
                scaleRoot.localScale = Vector3.one * Mathf.Lerp(peak, target, t);
                yield return null;
            }

            scaleRoot.localScale = Vector3.one * target;
            currentAnimation = null;
        }

        private void ResetScale()
        {
            if (currentAnimation != null)
            {
                StopCoroutine(currentAnimation);
                currentAnimation = null;
            }

            scaleRoot.localScale = Vector3.one;
        }

        private static float EaseOutBack(float value)
        {
            const float overshoot = 1.70158f;
            float inv = value - 1f;
            return 1f + ((overshoot + 1f) * inv * inv * inv) + (overshoot * inv * inv);
        }
    }
}
