#!/usr/bin/env python3
"""
Script to sync workshop annotations to MLflow feedback.

This script reads annotations from the workshop database and logs them as MLflow feedback.
It supports both single-metric (rating) and multi-metric (ratings JSON) annotations.

Usage:
    # In Databricks notebook:
    dbutils.widgets.text("input_file", "", "Input File Path")
    %run ./sync_workshop_to_mlflow.py
    
    # Standalone:
    python sync_workshop_to_mlflow.py --input-file workshop.db --dry-run
"""

import argparse
import json
import os
import sqlite3
import sys
from typing import Dict, List, Optional, Tuple

try:
    import mlflow
    from mlflow.entities import AssessmentSource, AssessmentSourceType
    MLFLOW_AVAILABLE = True
except ImportError:
    MLFLOW_AVAILABLE = False
    print("⚠️  MLflow not available - running in dry-run mode only")


def log_single_feedback(
    mlflow_trace_id: str,
    feedback_name: str,
    rating_value: int,
    user_name: str,
    user_email: str,
    comment: Optional[str] = None,
    dry_run: bool = False,
) -> bool:
    """
    Log a single feedback entry to MLflow.
    
    Args:
        mlflow_trace_id: MLflow trace ID (e.g., 'tr-0fb5fe4f966cb5b3586196c652550429')
        feedback_name: Name of the metric (e.g., 'helpfulness', 'safety')
        rating_value: Rating value (1-5 scale)
        user_name: Name of the user who provided the rating
        user_email: Email of the user
        comment: Optional user comment
        dry_run: If True, don't actually log to MLflow
        
    Returns:
        True if successful, False otherwise
    """
    if dry_run:
        print(f"    [DRY RUN] Would log: {feedback_name} = {rating_value}/5")
        if comment:
            print(f"              Comment: {comment}")
        return True
    
    if not MLFLOW_AVAILABLE:
        print(f"    ⚠️  MLflow not available, skipping: {feedback_name}")
        return False
    
    try:
        # Map numeric rating to label
        rating_labels = {
            1: "strongly disagree",
            2: "disagree", 
            3: "neutral",
            4: "agree",
            5: "strongly agree",
        }
        rating_label = rating_labels.get(rating_value, f"{rating_value}/5")
        
        # Construct rationale with rating label
        rationale_parts = [f"{rating_label} - {user_name}"]
        if comment:
            rationale_parts.append(f"Comment: {comment}")
        
        rationale = " | ".join(rationale_parts)
        
        # Log feedback
        mlflow.log_feedback(
            trace_id=mlflow_trace_id,
            name=feedback_name,
            value=rating_value,
            rationale=rationale,
            source=AssessmentSource(
                source_type=AssessmentSourceType.HUMAN, 
                source_id=user_email
            ),
        )
        
        print(f"    ✅ Logged: {feedback_name} = {rating_value}/5")
        return True
        
    except Exception as e:
        print(f"    ❌ Failed to log {feedback_name}: {e}")
        return False


def log_annotation_feedback(
    annotation_id: str,
    trace_id: str,
    mlflow_trace_id: str,
    user_name: str,
    user_email: str,
    rating: Optional[int] = None,
    ratings: Optional[str] = None,
    comment: Optional[str] = None,
    rubric_questions: Optional[List[Tuple[str, str]]] = None,
    dry_run: bool = False,
) -> Dict[str, int]:
    """
    Log feedback from a workshop annotation to MLflow.
    
    Handles both single-metric (rating) and multi-metric (ratings JSON) annotations.
    
    Args:
        annotation_id: Workshop annotation ID
        trace_id: Workshop trace ID
        mlflow_trace_id: MLflow trace ID
        user_name: Name of user who provided rating
        user_email: Email of user
        rating: Legacy single rating value (1-5)
        ratings: JSON string with multiple ratings {"helpfulness": 4, "safety": 5}
        comment: Optional user comment
        rubric_questions: List of (question_id, question_text) tuples for metric names
        dry_run: If True, don't actually log to MLflow
        
    Returns:
        Dictionary with counts: {'total': N, 'success': M, 'failed': K}
    """
    stats = {'total': 0, 'success': 0, 'failed': 0}
    
    print(f"  📝 Annotation {annotation_id[:8]}... by {user_name}")
    print(f"     Trace: {mlflow_trace_id}")
    
    # Handle multi-metric ratings (new format)
    if ratings:
        try:
            ratings_dict = json.loads(ratings)
            print(f"     Multi-metric ratings: {len(ratings_dict)} metrics")
            
            # Build mapping from question_id to question title
            question_id_to_title = {}
            if rubric_questions:
                for rubric_id, question_text in rubric_questions:
                    # Parse the full rubric text which has questions separated by the special delimiter
                    QUESTION_DELIMITER = '|||QUESTION_SEPARATOR|||'
                    question_parts = question_text.split(QUESTION_DELIMITER)
                    for index, part in enumerate(question_parts):
                        part = part.strip()
                        if not part:
                            continue
                        question_id = f"{rubric_id}_{index}"
                        # Extract just the title (before the colon if present)
                        title = part.split(':')[0].strip() if ':' in part else part.strip()
                        question_id_to_title[question_id] = title
            
            for metric_id, rating_value in ratings_dict.items():
                stats['total'] += 1
                
                # Map metric_id to question title, or use the ID if not found
                if metric_id in question_id_to_title:
                    feedback_name = question_id_to_title[metric_id]
                else:
                    # Fallback: use the metric_id itself
                    feedback_name = metric_id
                
                # Clean up metric name for MLflow
                feedback_name = feedback_name.strip().replace(' ', '_').lower()
                
                success = log_single_feedback(
                    mlflow_trace_id=mlflow_trace_id,
                    feedback_name=feedback_name,
                    rating_value=rating_value,
                    user_name=user_name,
                    user_email=user_email,
                    comment=comment,
                    dry_run=dry_run,
                )
                
                if success:
                    stats['success'] += 1
                else:
                    stats['failed'] += 1
                    
        except json.JSONDecodeError as e:
            print(f"     ❌ Failed to parse ratings JSON: {e}")
            stats['total'] += 1
            stats['failed'] += 1
            
    # Handle single-metric rating (legacy format)
    elif rating is not None:
        stats['total'] += 1
        print(f"     Single rating: {rating}/5")
        
        # Try to get metric name from rubric
        feedback_name = "overall_quality"  # default
        if rubric_questions and len(rubric_questions) > 0:
            # Use first rubric question as the metric name
            question_text = rubric_questions[0][1]
            feedback_name = question_text.split(':')[0].strip() if ':' in question_text else question_text.strip()
            feedback_name = feedback_name.replace(' ', '_').lower()
        
        success = log_single_feedback(
            mlflow_trace_id=mlflow_trace_id,
            feedback_name=feedback_name,
            rating_value=rating,
            user_name=user_name,
            user_email=user_email,
            comment=comment,
            dry_run=dry_run,
        )
        
        if success:
            stats['success'] += 1
        else:
            stats['failed'] += 1
    else:
        print(f"     ⚠️  No ratings found")
    
    return stats


def process_workshop_database(
    db_path: str,
    workshop_id: Optional[str] = None,
    dry_run: bool = False,
):
    """
    Process all annotations from workshop database and sync to MLflow.
    
    Args:
        db_path: Path to workshop.db SQLite file
        workshop_id: Optional workshop ID to filter by
        dry_run: If True, don't actually log to MLflow
    """
    print(f"\n{'=' * 80}")
    print(f"Workshop to MLflow Sync")
    print(f"{'=' * 80}")
    print(f"Database: {db_path}")
    print(f"Dry run: {dry_run}")
    if workshop_id:
        print(f"Workshop ID: {workshop_id}")
    print(f"{'=' * 80}\n")
    
    # Connect to database
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
    except Exception as e:
        print(f"❌ Failed to connect to database: {e}")
        return
    
    # Build query
    query = """
        SELECT 
            a.id as annotation_id,
            a.trace_id,
            t.mlflow_trace_id,
            a.rating,
            a.ratings,
            a.comment,
            u.name as user_name,
            u.email as user_email,
            a.workshop_id
        FROM annotations a
        JOIN traces t ON a.trace_id = t.id
        JOIN users u ON a.user_id = u.id
    """
    
    params = []
    if workshop_id:
        query += " WHERE a.workshop_id = ?"
        params.append(workshop_id)
    
    query += " ORDER BY a.created_at"
    
    try:
        cursor.execute(query, params)
        annotations = cursor.fetchall()
    except Exception as e:
        print(f"❌ Failed to query annotations: {e}")
        conn.close()
        return
    
    print(f"Found {len(annotations)} annotations to process\n")
    
    if len(annotations) == 0:
        print("No annotations to process. Exiting.")
        conn.close()
        return
    
    # Get rubric questions for context
    rubric_query = """
        SELECT id, question
        FROM rubrics
    """
    if workshop_id:
        rubric_query += " WHERE workshop_id = ?"
    
    try:
        cursor.execute(rubric_query, params)
        rubric_questions = cursor.fetchall()
    except Exception as e:
        print(f"⚠️  Failed to fetch rubric questions: {e}")
        rubric_questions = []
    
    # Process each annotation
    total_stats = {'total': 0, 'success': 0, 'failed': 0}
    
    for i, row in enumerate(annotations, 1):
        (
            annotation_id,
            trace_id,
            mlflow_trace_id,
            rating,
            ratings,
            comment,
            user_name,
            user_email,
            ann_workshop_id,
        ) = row
        
        print(f"[{i}/{len(annotations)}]")
        
        # Skip if no mlflow_trace_id
        if not mlflow_trace_id:
            print(f"  ⚠️  Annotation {annotation_id[:8]}... skipped - no MLflow trace ID")
            print()
            continue
        
        stats = log_annotation_feedback(
            annotation_id=annotation_id,
            trace_id=trace_id,
            mlflow_trace_id=mlflow_trace_id,
            user_name=user_name,
            user_email=user_email,
            rating=rating,
            ratings=ratings,
            comment=comment,
            rubric_questions=rubric_questions,
            dry_run=dry_run,
        )
        
        total_stats['total'] += stats['total']
        total_stats['success'] += stats['success']
        total_stats['failed'] += stats['failed']
        
        print()
    
    conn.close()
    
    # Print summary
    print(f"{'=' * 80}")
    print("Summary")
    print(f"{'=' * 80}")
    print(f"Annotations processed: {len(annotations)}")
    print(f"Total feedback entries: {total_stats['total']}")
    print(f"Successfully logged: {total_stats['success']}")
    print(f"Failed: {total_stats['failed']}")
    print(f"{'=' * 80}\n")


def main():
    """Main function - supports both standalone and Databricks notebook usage."""
    
    db_path = "/Volumes/user/workshop/workshop_c91a2432-0524-47d8-a588-e2c2b37a04ec.db"
    if not db_path:
        print("❌ Please set the 'input_file' widget to the path of workshop.db")
        return
    
    # Databricks: run with actual MLflow logging
    process_workshop_database(db_path=db_path, dry_run=False)
    

if __name__ == "__main__":
    main()

