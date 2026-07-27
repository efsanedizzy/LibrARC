using System.Collections;
using System.Collections.Generic;
using BlockPlus.Data;
using BlockPlus.Pieces;
using UnityEngine;
using UnityEngine.UI;

namespace BlockPlus.Board
{
    public sealed class BoardManager : MonoBehaviour
    {
        [SerializeField] private RectTransform boardRoot;
        [SerializeField] private GridLayoutGroup gridLayout;
        [SerializeField] private Transform cellParent;
        [SerializeField] private BoardCellView cellPrefab;

        private readonly List<BoardCellView> previewedCells = new List<BoardCellView>(9);
        private readonly List<Vector2Int> reusableOccupiedPositions = new List<Vector2Int>(81);

        private GameConfig config;
        private bool[,] occupied;
        private Color[,] cellColors;
        private BoardCellView[,] cellViews;

        public int BoardSize => config == null ? 0 : config.boardSize;

        public void Initialize(GameConfig gameConfig)
        {
            config = gameConfig;
            occupied = new bool[config.boardSize, config.boardSize];
            cellColors = new Color[config.boardSize, config.boardSize];
            cellViews = new BoardCellView[config.boardSize, config.boardSize];
            BuildBoard();
            ResetBoard();
        }

        public void ResetBoard()
        {
            if (occupied == null)
            {
                return;
            }

            for (int row = 0; row < config.boardSize; row++)
            {
                for (int column = 0; column < config.boardSize; column++)
                {
                    occupied[row, column] = false;
                    cellColors[row, column] = Color.clear;
                    cellViews[row, column].SetEmpty();
                }
            }

            ClearPreview();
        }

        public bool TryGetAnchorFromScreenPosition(Vector2 screenPosition, PieceShapeData shape, Camera uiCamera, out Vector2Int anchor)
        {
            anchor = Vector2Int.zero;

            // Convert the finger position into a board cell, then offset by the shape pivot.
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(boardRoot, screenPosition, uiCamera, out Vector2 localPoint))
            {
                return false;
            }

            Rect rect = boardRoot.rect;
            Vector2 cellSize = gridLayout.cellSize;
            Vector2 spacing = gridLayout.spacing;
            float totalWidth = (cellSize.x * config.boardSize) + (spacing.x * (config.boardSize - 1));
            float totalHeight = (cellSize.y * config.boardSize) + (spacing.y * (config.boardSize - 1));
            float left = (-boardRoot.pivot.x * rect.width) + ((rect.width - totalWidth) * 0.5f);
            float top = ((1f - boardRoot.pivot.y) * rect.height) - ((rect.height - totalHeight) * 0.5f);
            float fullCellWidth = cellSize.x + spacing.x;
            float fullCellHeight = cellSize.y + spacing.y;

            int column = Mathf.FloorToInt((localPoint.x - left) / fullCellWidth);
            int row = Mathf.FloorToInt((top - localPoint.y) / fullCellHeight);

            if (column < 0 || row < 0 || column >= config.boardSize || row >= config.boardSize)
            {
                return false;
            }

            anchor = new Vector2Int(column - shape.Pivot.x, row - shape.Pivot.y);
            return true;
        }

        public bool ShowPreview(RuntimePiece piece, Vector2Int anchor)
        {
            ClearPreview();

            bool valid = CanPlace(piece.Shape, anchor);
            IReadOnlyList<Vector2Int> cells = piece.Shape.Cells;

            for (int index = 0; index < cells.Count; index++)
            {
                Vector2Int position = anchor + cells[index];
                if (!IsInside(position))
                {
                    continue;
                }

                BoardCellView view = cellViews[position.y, position.x];
                view.SetPreview(piece.Tint, valid);
                previewedCells.Add(view);
            }

            return valid;
        }

        public void ClearPreview()
        {
            for (int index = 0; index < previewedCells.Count; index++)
            {
                previewedCells[index].ClearPreview();
            }

            previewedCells.Clear();
        }

        public bool CanPlace(PieceShapeData shape, Vector2Int anchor)
        {
            IReadOnlyList<Vector2Int> cells = shape.Cells;

            for (int index = 0; index < cells.Count; index++)
            {
                Vector2Int position = anchor + cells[index];
                if (!IsInside(position) || occupied[position.y, position.x])
                {
                    return false;
                }
            }

            return true;
        }

        public BoardPlacementResult PlacePiece(RuntimePiece piece, Vector2Int anchor)
        {
            if (!CanPlace(piece.Shape, anchor))
            {
                return BoardPlacementResult.Failed;
            }

            // First commit the piece to the board, then evaluate which lines became full.
            var placedCells = new List<Vector2Int>(piece.CellCount);
            IReadOnlyList<Vector2Int> cells = piece.Shape.Cells;

            for (int index = 0; index < cells.Count; index++)
            {
                Vector2Int position = anchor + cells[index];
                occupied[position.y, position.x] = true;
                cellColors[position.y, position.x] = piece.Tint;
                cellViews[position.y, position.x].SetFilled(piece.Tint);
                cellViews[position.y, position.x].PlayPlacementAnimation();
                placedCells.Add(position);
            }

            var rowsToClear = new List<int>();
            var columnsToClear = new List<int>();
            CollectCompletedLines(rowsToClear, columnsToClear);

            var clearedCells = new List<Vector2Int>();
            for (int index = 0; index < rowsToClear.Count; index++)
            {
                int row = rowsToClear[index];
                for (int column = 0; column < config.boardSize; column++)
                {
                    AddUniqueCell(clearedCells, new Vector2Int(column, row));
                }
            }

            for (int index = 0; index < columnsToClear.Count; index++)
            {
                int column = columnsToClear[index];
                for (int row = 0; row < config.boardSize; row++)
                {
                    AddUniqueCell(clearedCells, new Vector2Int(column, row));
                }
            }

            return new BoardPlacementResult(true, rowsToClear.Count + columnsToClear.Count, placedCells, clearedCells);
        }

        public IEnumerator AnimateClearRoutine(BoardPlacementResult result)
        {
            if (result.ClearedCells.Count == 0)
            {
                yield break;
            }

            // Flash first, then shrink the cells out and clear the board state.
            for (int index = 0; index < result.ClearedCells.Count; index++)
            {
                Vector2Int position = result.ClearedCells[index];
                cellViews[position.y, position.x].PlayFlashAnimation(config.clearFlashDuration);
            }

            yield return new WaitForSecondsRealtime(config.clearFlashDuration);

            for (int index = 0; index < result.ClearedCells.Count; index++)
            {
                Vector2Int position = result.ClearedCells[index];
                cellViews[position.y, position.x].PlayClearAnimation(config.clearRemoveDelay);
            }

            yield return new WaitForSecondsRealtime(config.clearRemoveDelay);

            for (int index = 0; index < result.ClearedCells.Count; index++)
            {
                Vector2Int position = result.ClearedCells[index];
                occupied[position.y, position.x] = false;
                cellColors[position.y, position.x] = Color.clear;
                cellViews[position.y, position.x].SetEmpty();
            }
        }

        public bool HasAnyValidMove(IReadOnlyList<RuntimePiece> pieces)
        {
            // The board is only 9x9, so a full brute-force scan is cheap and reliable.
            for (int pieceIndex = 0; pieceIndex < pieces.Count; pieceIndex++)
            {
                RuntimePiece piece = pieces[pieceIndex];
                if (piece == null || piece.Shape == null)
                {
                    continue;
                }

                for (int row = 0; row < config.boardSize; row++)
                {
                    for (int column = 0; column < config.boardSize; column++)
                    {
                        if (CanPlace(piece.Shape, new Vector2Int(column, row)))
                        {
                            return true;
                        }
                    }
                }
            }

            return false;
        }

        public List<Vector2Int> ClearRandomOccupiedCells(int amount)
        {
            reusableOccupiedPositions.Clear();

            for (int row = 0; row < config.boardSize; row++)
            {
                for (int column = 0; column < config.boardSize; column++)
                {
                    if (occupied[row, column])
                    {
                        reusableOccupiedPositions.Add(new Vector2Int(column, row));
                    }
                }
            }

            int clearCount = Mathf.Min(amount, reusableOccupiedPositions.Count);
            var cleared = new List<Vector2Int>(clearCount);

            for (int index = 0; index < clearCount; index++)
            {
                int randomIndex = Random.Range(index, reusableOccupiedPositions.Count);
                Vector2Int temp = reusableOccupiedPositions[index];
                reusableOccupiedPositions[index] = reusableOccupiedPositions[randomIndex];
                reusableOccupiedPositions[randomIndex] = temp;

                Vector2Int position = reusableOccupiedPositions[index];
                occupied[position.y, position.x] = false;
                cellColors[position.y, position.x] = Color.clear;
                cellViews[position.y, position.x].SetEmpty();
                cleared.Add(position);
            }

            return cleared;
        }

        public Vector3 GetCellWorldPosition(Vector2Int position)
        {
            return cellViews[position.y, position.x].RectTransform.position;
        }

        private void BuildBoard()
        {
            for (int childIndex = cellParent.childCount - 1; childIndex >= 0; childIndex--)
            {
                GameObject child = cellParent.GetChild(childIndex).gameObject;
                if (Application.isPlaying)
                {
                    Destroy(child);
                }
                else
                {
                    DestroyImmediate(child);
                }
            }

            gridLayout.constraint = GridLayoutGroup.Constraint.FixedColumnCount;
            gridLayout.constraintCount = config.boardSize;

            for (int row = 0; row < config.boardSize; row++)
            {
                for (int column = 0; column < config.boardSize; column++)
                {
                    BoardCellView instance = Instantiate(cellPrefab, cellParent);
                    instance.name = $"Cell_{row}_{column}";
                    instance.SetEmpty();
                    cellViews[row, column] = instance;
                }
            }
        }

        private bool IsInside(Vector2Int position)
        {
            return position.x >= 0
                && position.y >= 0
                && position.x < config.boardSize
                && position.y < config.boardSize;
        }

        private void CollectCompletedLines(List<int> rowsToClear, List<int> columnsToClear)
        {
            rowsToClear.Clear();
            columnsToClear.Clear();

            for (int row = 0; row < config.boardSize; row++)
            {
                bool full = true;
                for (int column = 0; column < config.boardSize; column++)
                {
                    if (!occupied[row, column])
                    {
                        full = false;
                        break;
                    }
                }

                if (full)
                {
                    rowsToClear.Add(row);
                }
            }

            for (int column = 0; column < config.boardSize; column++)
            {
                bool full = true;
                for (int row = 0; row < config.boardSize; row++)
                {
                    if (!occupied[row, column])
                    {
                        full = false;
                        break;
                    }
                }

                if (full)
                {
                    columnsToClear.Add(column);
                }
            }
        }

        private static void AddUniqueCell(List<Vector2Int> list, Vector2Int position)
        {
            if (!list.Contains(position))
            {
                list.Add(position);
            }
        }
    }
}
