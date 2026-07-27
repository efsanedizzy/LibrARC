using System.Collections.Generic;
using UnityEngine;

namespace BlockPlus.Data
{
    [CreateAssetMenu(menuName = "BlockPlus/Pieces/Piece Shape", fileName = "PieceShape")]
    public sealed class PieceShapeData : ScriptableObject
    {
        [SerializeField] private string displayName = "New Shape";
        [SerializeField] private List<Vector2Int> cells = new List<Vector2Int>();
        [SerializeField] private Vector2Int pivot;

        public string DisplayName => displayName;

        // Shape cells use x = column and y = row so they map cleanly to UI grid math.
        public IReadOnlyList<Vector2Int> Cells => cells;

        public Vector2Int Pivot => pivot;
        public int CellCount => cells.Count;
        public int Width => GetMaxX() + 1;
        public int Height => GetMaxY() + 1;

        public IEnumerable<Vector2Int> GetAbsoluteCells(Vector2Int anchor)
        {
            for (int index = 0; index < cells.Count; index++)
            {
                yield return anchor + cells[index];
            }
        }

        private int GetMaxX()
        {
            int max = 0;

            for (int index = 0; index < cells.Count; index++)
            {
                if (cells[index].x > max)
                {
                    max = cells[index].x;
                }
            }

            return max;
        }

        private int GetMaxY()
        {
            int max = 0;

            for (int index = 0; index < cells.Count; index++)
            {
                if (cells[index].y > max)
                {
                    max = cells[index].y;
                }
            }

            return max;
        }

#if UNITY_EDITOR
        public void SetEditorData(string newDisplayName, List<Vector2Int> newCells, Vector2Int newPivot)
        {
            displayName = newDisplayName;
            cells = newCells;
            pivot = newPivot;
        }

        private void OnValidate()
        {
            var uniqueCells = new HashSet<Vector2Int>(cells);
            cells = new List<Vector2Int>(uniqueCells);
            pivot.x = Mathf.Clamp(pivot.x, 0, Mathf.Max(0, Width - 1));
            pivot.y = Mathf.Clamp(pivot.y, 0, Mathf.Max(0, Height - 1));
        }
#endif
    }
}
