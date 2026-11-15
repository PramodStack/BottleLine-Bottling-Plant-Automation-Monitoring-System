' ==========================================================================
' ===== DATABASE INTEGRATION: SCRIPT-LEVEL STATE VARIABLES ==================
' These variables persist across TimeScript_Tick executions in DIAView.
' No new DIAView tags need to be created in the tag dictionary.
' When the simulation starts or restarts, VBScript initializes them to Empty.
' ==========================================================================
Dim dbInitStage      ' Initialization sequencer: 0=summary check, 1=batch check, 2=get max bottle no, 3=ready
Dim dbBottleActive   ' True while a bottle is on conveyor 1 (from leaving pos 0 until capped or rejected)
Dim dbBottleNo       ' Current sequential production bottle number
Dim dbNbStage        ' New-bottle SQL sequencer: 1=inc summary total, 2=insert log row
Dim dbInspStage      ' Inspection SQL sequencer: 1=update log status, 2=inc summary accepted/rejected
Dim dbInspResult     ' 1 = Passed, 2 = Rejected
Dim dbInspBottleNo   ' Bottle number for the inspection decision being logged
Dim dbCapPend        ' Boolean flag: True when capping is complete and log row needs cap_status='Capped'
Dim dbCapBottleNo    ' Bottle number for the capping completion being logged
Dim dbPackPend       ' Counter of pending packed-bottle batch increments
Dim dbPackingSensorPrev ' Previous state of PACKING_SENSOR for rising-edge detection
Dim dbBoxPackPend    ' Counter of pending packed-box summary increments
Dim dbBatchStarted   ' True once batch status has been set to 'In Progress'
Dim dbLastExec       ' Timer value of last executed query (for 200 ms throttling)
Dim dbLastFail       ' Timer value of last database failure (for 3-second retry backoff)
Dim dbLastErr        ' Last error description string (for diagnostics)
Dim dbProv           ' Cached database provider string

Sub TimeScript_Tick()
  
' ==========================================================
' PACKING SENSOR + TRAY SENSOR  (runs FIRST on every tick)
' - Packing sensor: ON for 4 s every time Box 2 becomes visible
' - Tray sensor   : ON for 3.5 s every time Box 3 becomes visible
' Placed at the top so a problem anywhere further down the
' script can never stop these two sensors from being updated.
' Only the *_START_TIME tags are used for timing (no CYCLE_DONE).
' ==========================================================

' ---------- PACKING SENSOR (BOX 2) ----------
If Var.Bottling_Group.BOX_2_VISIBLE.Value = True Then

    ' Start the 4-second window once, when Box 2 appears
    If Var.Bottling_Group.PACKING_SENSOR_START_TIME.Value = 0 Then
        On Error Resume Next
        Var.Bottling_Group.PACKING_SENSOR_START_TIME.Value = Timer
        On Error GoTo 0
    End If

    If Var.Bottling_Group.PACKING_SENSOR_START_TIME.Value = 0 Then
        ' Timer tag could not store the time: keep sensor ON while Box 2 is visible
        Var.Bottling_Group.PACKING_SENSOR.Value = True
    Else
        elapsed = Timer - Var.Bottling_Group.PACKING_SENSOR_START_TIME.Value
        If elapsed < 0 Then
            elapsed = elapsed + 86400
        End If

        If elapsed < 4 Then
            Var.Bottling_Group.PACKING_SENSOR.Value = True
        Else
            ' 4 s finished: OFF. START_TIME stays set so it does not retrigger
            ' for this same Box 2.
            Var.Bottling_Group.PACKING_SENSOR.Value = False
        End If
    End If

Else
    ' Box 2 hidden: sensor OFF and re-armed for the next Box 2
    Var.Bottling_Group.PACKING_SENSOR.Value = False
    Var.Bottling_Group.PACKING_SENSOR_START_TIME.Value = 0
End If

' ===== DATABASE INTEGRATION: BOX PACKED EVENT (PACKING_SENSOR RISING EDGE) =====
If IsEmpty(dbPackingSensorPrev) Then dbPackingSensorPrev = False
If IsEmpty(dbBoxPackPend) Then dbBoxPackPend = 0

If Var.Bottling_Group.PACKING_SENSOR.Value = True And dbPackingSensorPrev = False Then
    dbBoxPackPend = dbBoxPackPend + 1
End If
dbPackingSensorPrev = (Var.Bottling_Group.PACKING_SENSOR.Value = True)
' ===== DATABASE INTEGRATION: END =====


' ---------- TRAY SENSOR (BOX 3) ----------
If Var.Bottling_Group.BOX_3_VISIBLE.Value = True Then

    ' Start the 3.5-second window once, when Box 3 appears
    If Var.Bottling_Group.TRAY_SENSOR_START_TIME.Value = 0 Then
        On Error Resume Next
        Var.Bottling_Group.TRAY_SENSOR_START_TIME.Value = Timer
        On Error GoTo 0
    End If

    If Var.Bottling_Group.TRAY_SENSOR_START_TIME.Value = 0 Then
        ' Timer tag could not store the time: keep sensor ON while Box 3 is visible
        Var.Bottling_Group.TRAY_SENSOR.Value = True
    Else
        elapsed = Timer - Var.Bottling_Group.TRAY_SENSOR_START_TIME.Value
        If elapsed < 0 Then
            elapsed = elapsed + 86400
        End If

        If elapsed < 3.5 Then
            Var.Bottling_Group.TRAY_SENSOR.Value = True
        Else
            Var.Bottling_Group.TRAY_SENSOR.Value = False
        End If
    End If

Else
    ' Box 3 hidden: sensor OFF and re-armed for the next Box 3
    Var.Bottling_Group.TRAY_SENSOR.Value = False
    Var.Bottling_Group.TRAY_SENSOR_START_TIME.Value = 0
End If


  
' BOTTLE 1 & 2 CONVEYOR MOVEMENT SYNCHRONIZATION
' If any sensor stops the conveyor, both bottles stop at the exact same instant.
Dim convCanMove
convCanMove = (Var.Bottling_Group.BOT_CONV.Value = True) _
   And (Var.Bottling_Group.BOT_FILL_SENSOR.Value = False) _
   And (Var.Bottling_Group.BOT_FILL_VALVE.Value = False) _
   And (Var.Bottling_Group.BOT_CHECK_SENSOR.Value = False) _
   And (Var.Bottling_Group.BOT_CAP_SENSOR.Value = False) _
   And (Var.Bottling_Group.BOT_PICK_SENSOR.Value = False)

If convCanMove Then

    If Var.Bottling_Group.BOTTLE_VISIBLE.Value = False Then
        Var.Bottling_Group.BOTTLE_VISIBLE.Value = True
    End If

    If Var.Bottling_Group.BOTTLE_POSITION.Value < 100 Then
        Var.Bottling_Group.BOTTLE_POSITION.Value = _
            Var.Bottling_Group.BOTTLE_POSITION.Value + 1
    End If

    Var.Bottling_Group.BOTTLE_1_TICK.Value = 0

Else
    Var.Bottling_Group.BOTTLE_1_TICK.Value = 0
End If


 


' KEEP CAPS ANIMATION CONTROLLED BY CAP_FEEDER
If Var.Bottling_Group.CAP_FEEDER.Value = True Then

    If Var.Bottling_Group.CAPPING_STEP.Value = 0 Then

        Var.Bottling_Group.CAP_1_DOWN.Value = 0
        Var.Bottling_Group.CAP_2_DOWN.Value = 0
        Var.Bottling_Group.CAP_2_RIGHT.Value = 0
        Var.Bottling_Group.CAP_3_RIGHT.Value = 0
        Var.Bottling_Group.CAP_4_DOWN.Value = 0

        Var.Bottling_Group.CAPPING_STEP.Value = 1

    ElseIf Var.Bottling_Group.CAPPING_STEP.Value = 1 Then

        If Var.Bottling_Group.CAP_1_DOWN.Value < 9 Then
            Var.Bottling_Group.CAP_1_DOWN.Value = _
                Var.Bottling_Group.CAP_1_DOWN.Value + 1
        Else
            Var.Bottling_Group.CAP_1_DOWN.Value = 9
            Var.Bottling_Group.CAPPING_STEP.Value = 2
        End If

    ElseIf Var.Bottling_Group.CAPPING_STEP.Value = 2 Then

        If Var.Bottling_Group.CAP_2_DOWN.Value < 40 Then
            Var.Bottling_Group.CAP_2_DOWN.Value = _
                Var.Bottling_Group.CAP_2_DOWN.Value + 4
        End If

        If Var.Bottling_Group.CAP_2_RIGHT.Value < 27 Then
            Var.Bottling_Group.CAP_2_RIGHT.Value = _
                Var.Bottling_Group.CAP_2_RIGHT.Value + 3
        End If

        If Var.Bottling_Group.CAP_2_DOWN.Value >= 40 _
           And Var.Bottling_Group.CAP_2_RIGHT.Value >= 27 Then

            Var.Bottling_Group.CAP_2_DOWN.Value = 40
            Var.Bottling_Group.CAP_2_RIGHT.Value = 27
            Var.Bottling_Group.CAPPING_STEP.Value = 3

        End If

    ElseIf Var.Bottling_Group.CAPPING_STEP.Value = 3 Then

        If Var.Bottling_Group.CAP_3_RIGHT.Value < 42 Then
            Var.Bottling_Group.CAP_3_RIGHT.Value = _
                Var.Bottling_Group.CAP_3_RIGHT.Value + 4
        Else
            Var.Bottling_Group.CAP_3_RIGHT.Value = 42
            Var.Bottling_Group.CAPPING_STEP.Value = 4
        End If
	End If


End If


' ==========================================
' CAP4 + CAPPING PLC CONTROL
' ==========================================

' Start only after CAP1, CAP2 and CAP3 finish,
' CAP_FEEDER turns OFF, and CAPPING turns ON.
If Var.Bottling_Group.CAPPING_STEP.Value = 4 _
   And Var.Bottling_Group.CAP_FEEDER.Value = False _
   And Var.Bottling_Group.CAPPING.Value = True Then

    Var.Bottling_Group.CAPPING_CYCLE_ACTIVE.Value = True

End If


' Move CAP4 while the PLC CAPPING tag is ON.
If Var.Bottling_Group.CAPPING_CYCLE_ACTIVE.Value = True Then

    If Var.Bottling_Group.CAPPING.Value = True Then

        If Var.Bottling_Group.CAP_4_DOWN.Value < 110 Then

            Var.Bottling_Group.CAP_4_DOWN.Value = _
                Var.Bottling_Group.CAP_4_DOWN.Value + 16

            If Var.Bottling_Group.CAP_4_DOWN.Value > 110 Then
                Var.Bottling_Group.CAP_4_DOWN.Value = 110
            End If

        End If

        ' CAP4 has reached its full extension.
        If Var.Bottling_Group.CAP_4_DOWN.Value >= 110 Then
            Var.Bottling_Group.CAP_4_DOWN.Value = 110
            Var.Bottling_Group.CAPPING_STEP.Value = 5
        End If

    Else

        ' CAPPING PLC output turned OFF: reset the caps.
        Var.Bottling_Group.CAP_1_DOWN.Value = 0
        Var.Bottling_Group.CAP_2_DOWN.Value = 0
        Var.Bottling_Group.CAP_2_RIGHT.Value = 0
        Var.Bottling_Group.CAP_3_RIGHT.Value = 0
        Var.Bottling_Group.CAP_4_DOWN.Value = 0

        Var.Bottling_Group.CAPPING_STEP.Value = 0
        Var.Bottling_Group.CAPPING_CYCLE_ACTIVE.Value = False

    End If

End If


' PHASE 3: RESET WHEN PLC CAPPING TURNS OFF
If Var.Bottling_Group.CAPPING_CYCLE_ACTIVE.Value = True _
   And Var.Bottling_Group.CAPPING.Value = False Then

    Var.Bottling_Group.CAP_1_DOWN.Value = 0
    Var.Bottling_Group.CAP_2_DOWN.Value = 0
    Var.Bottling_Group.CAP_2_RIGHT.Value = 0
    Var.Bottling_Group.CAP_3_RIGHT.Value = 0
    Var.Bottling_Group.CAP_4_DOWN.Value = 0

    Var.Bottling_Group.CAPPING_STEP.Value = 0
    Var.Bottling_Group.CAPPING_CYCLE_ACTIVE.Value = False

End If

 
 If Var.Bottling_Group.CAPPING_STEP.Value = 5 Then
 
     Var.Bottling_Group.BOTTLE_VISIBLE.Value = True
     Var.Bottling_Group.BOTTLE_POSITION.Value = 0
 
     Var.Bottling_Group.BOTTLE_2_POSITION.Value = 0
     Var.Bottling_Group.BOTTLE_2_VISIBLE.Value = True
 
     Var.Bottling_Group.CAPPING_STEP.Value = 6
 
 End If

 ' ===== DATABASE INTEGRATION: CAPPING COMPLETE EVENT =====
 ' Captures capping completion once per bottle before Step 6 clears.
 If dbBottleActive = True _
    And Var.Bottling_Group.CAPPING_STEP.Value = 6 Then
     dbCapBottleNo = dbBottleNo
     dbCapPend = True
     dbBottleActive = False
 End If
 ' ===== DATABASE INTEGRATION: END =====
 
 If Var.Bottling_Group.CAPPING_STEP.Value = 6 Then
 
	If Var.Bottling_Group.CAP_FEEDER.Value = False _
	   And Var.Bottling_Group.CAPPING_CYCLE_ACTIVE.Value = False Then
 
         Var.Bottling_Group.CAP_1_DOWN.Value = 0
         Var.Bottling_Group.CAP_2_DOWN.Value = 0
         Var.Bottling_Group.CAP_2_RIGHT.Value = 0
         Var.Bottling_Group.CAP_3_RIGHT.Value = 0
         Var.Bottling_Group.CAP_4_DOWN.Value = 0
 
         Var.Bottling_Group.CAPPING_STEP.Value = 0
 
     End If
 
 End If

 ' ===== DATABASE INTEGRATION: NEW BOTTLE EVENT =====
 ' Placed AFTER CAPPING_STEP resets so position reset to 0 has already occurred.
 ' Assigns next sequential bottle number once bottle leaves position 0.
 If dbInitStage >= 3 _
    And dbBottleActive = False _
    And Var.Bottling_Group.BOTTLE_VISIBLE.Value = True _
    And Var.Bottling_Group.BOTTLE_POSITION.Value >= 1 Then

     dbBottleNo = dbBottleNo + 1
     dbBottleActive = True
     dbNbStage = 1

 End If
 ' ===== DATABASE INTEGRATION: END =====
 
 If Var.Bottling_Group.BOTTLE_2_VISIBLE.Value = True Then
 
     If convCanMove Then
 
         If Var.Bottling_Group.BOTTLE_2_POSITION.Value < 100 Then
 
             Var.Bottling_Group.BOTTLE_2_POSITION.Value = Var.Bottling_Group.BOTTLE_2_POSITION.Value + 2
 
         Else
 
             Var.Bottling_Group.BOTTLE_2_POSITION.Value = 100
             Var.Bottling_Group.BOTTLE_2_VISIBLE.Value = False
             Var.Bottling_Group.BOTTLE_2_POSITION.Value = 0
             Var.Bottling_Group.BOTTLE_3_VISIBLE.Value = True
 
         End If
 
     End If
 
 End If
 
 
' THREE-PICKER SEQUENCE
 If Var.Bottling_Group.BOTTLE_3_VISIBLE.Value = True _
    Or Var.Bottling_Group.PICKER_STEP.Value > 0 Then

     ' Keep sequence running to completion once initiated, or start if PICKER is ON
     If Var.Bottling_Group.PICKER.Value = True _
        Or Var.Bottling_Group.PICKER_STEP.Value > 0 Then

         ' STEP 0: Start with small picker when bottle 3 is present and PICKER tag is ON
         If Var.Bottling_Group.PICKER_STEP.Value = 0 Then

             If Var.Bottling_Group.PICKER.Value = True _
                And Var.Bottling_Group.BOTTLE_3_VISIBLE.Value = True Then

                 Var.Bottling_Group.SMALL_PICKER_HEIGHT.Value = 0
                 Var.Bottling_Group.SMALL_PICKER_VISIBLE.Value = True

                 Var.Bottling_Group.LARGE_PICKER_HEIGHT.Value = 0
                 Var.Bottling_Group.LARGE_PICKER_HORIZONTAL.Value = 0
                 Var.Bottling_Group.LARGE_PICKER_VISIBLE.Value = False

                 Var.Bottling_Group.FINAL_PICKER_HEIGHT.Value = 0
                 Var.Bottling_Group.FINAL_PICKER_VISIBLE.Value = False
                 
                 Var.Bottling_Group.BOTTLE_3_VERTICAL.Value = 0
                 Var.Bottling_Group.BOTTLE_3_HORIZONTAL.Value = 0

                 Var.Bottling_Group.PICKER_STEP.Value = 1

             End If

         ' STEP 1: Small picker stretches from 147 to 247
         ElseIf Var.Bottling_Group.PICKER_STEP.Value = 1 Then

             If Var.Bottling_Group.SMALL_PICKER_HEIGHT.Value < 247 Then
                 Var.Bottling_Group.SMALL_PICKER_HEIGHT.Value = Var.Bottling_Group.SMALL_PICKER_HEIGHT.Value + 30
             End If

             If Var.Bottling_Group.SMALL_PICKER_HEIGHT.Value >= 247 Then
                 Var.Bottling_Group.SMALL_PICKER_HEIGHT.Value = 247

                 Var.Bottling_Group.SMALL_PICKER_VISIBLE.Value = False
                 Var.Bottling_Group.LARGE_PICKER_HEIGHT.Value = 0
                 Var.Bottling_Group.LARGE_PICKER_HORIZONTAL.Value = 0
                 Var.Bottling_Group.LARGE_PICKER_VISIBLE.Value = True

                 Var.Bottling_Group.PICKER_STEP.Value = 2
             End If

         ' STEP 2: Large picker shrinks from 247 to 147 while Bottle 3 moves up
         ElseIf Var.Bottling_Group.PICKER_STEP.Value = 2 Then

             ' Shrink large picker
             If Var.Bottling_Group.LARGE_PICKER_HEIGHT.Value < 100 Then
                 Var.Bottling_Group.LARGE_PICKER_HEIGHT.Value = _
                     Var.Bottling_Group.LARGE_PICKER_HEIGHT.Value + 25
             End If

             If Var.Bottling_Group.LARGE_PICKER_HEIGHT.Value >= 100 Then
                 Var.Bottling_Group.LARGE_PICKER_HEIGHT.Value = 100
             End If

             ' Move Bottle 3 upward by 99
             If Var.Bottling_Group.BOTTLE_3_VERTICAL.Value < 99 Then
                 Var.Bottling_Group.BOTTLE_3_VERTICAL.Value = _
                     Var.Bottling_Group.BOTTLE_3_VERTICAL.Value + 25
             
                 If Var.Bottling_Group.BOTTLE_3_VERTICAL.Value > 99 Then
                     Var.Bottling_Group.BOTTLE_3_VERTICAL.Value = 99
                 End If
             End If

             ' Continue when both actions finish
             If Var.Bottling_Group.LARGE_PICKER_HEIGHT.Value >= 100 _
                And Var.Bottling_Group.BOTTLE_3_VERTICAL.Value >= 99 Then

                 Var.Bottling_Group.LARGE_PICKER_HEIGHT.Value = 100
                 Var.Bottling_Group.BOTTLE_3_VERTICAL.Value = 99
                 Var.Bottling_Group.PICKER_STEP.Value = 3

             End If

         ' STEP 3: Large picker and Bottle 3 moves right by 180
         ElseIf Var.Bottling_Group.PICKER_STEP.Value = 3 Then

             If Var.Bottling_Group.LARGE_PICKER_HORIZONTAL.Value < 180 Then
                 Var.Bottling_Group.LARGE_PICKER_HORIZONTAL.Value = _
                     Var.Bottling_Group.LARGE_PICKER_HORIZONTAL.Value + 15
             End If

             If Var.Bottling_Group.BOTTLE_3_HORIZONTAL.Value < 180 Then
                 Var.Bottling_Group.BOTTLE_3_HORIZONTAL.Value = _
                     Var.Bottling_Group.BOTTLE_3_HORIZONTAL.Value + 15
             End If

             If Var.Bottling_Group.LARGE_PICKER_HORIZONTAL.Value >= 180 _
                And Var.Bottling_Group.BOTTLE_3_HORIZONTAL.Value >= 180 Then

                 Var.Bottling_Group.LARGE_PICKER_HORIZONTAL.Value = 180
                 Var.Bottling_Group.BOTTLE_3_HORIZONTAL.Value = 180

                 Var.Bottling_Group.LARGE_PICKER_VISIBLE.Value = False
                 
                 ' Hide Bottle 3
                 Var.Bottling_Group.BOTTLE_3_VISIBLE.Value = False
                 
                 ' Show Bottle 4
                 Var.Bottling_Group.BOTTLE_4_VERTICAL.Value = 0
                 Var.Bottling_Group.BOTTLE_4_VISIBLE.Value = True
                 
                 ' Start final picker
                 Var.Bottling_Group.FINAL_PICKER_HEIGHT.Value = 0
                 Var.Bottling_Group.FINAL_PICKER_VISIBLE.Value = True
                 
                 Var.Bottling_Group.PICKER_STEP.Value = 4

             End If

         ' STEP 4: Stretch final picker while Bottle 4 moves down into the box
         ElseIf Var.Bottling_Group.PICKER_STEP.Value = 4 Then
         
             ' Stretch final picker downwards (0 to 399)
             If Var.Bottling_Group.FINAL_PICKER_HEIGHT.Value < 399 Then
                 Var.Bottling_Group.FINAL_PICKER_HEIGHT.Value = _
                     Var.Bottling_Group.FINAL_PICKER_HEIGHT.Value + 25
         
                 If Var.Bottling_Group.FINAL_PICKER_HEIGHT.Value > 399 Then
                     Var.Bottling_Group.FINAL_PICKER_HEIGHT.Value = 399
                 End If
             End If
         
             ' Move Bottle 4 down in direct lockstep with final picker (0 to 100)
             If Var.Bottling_Group.FINAL_PICKER_HEIGHT.Value >= 399 Then
                 Var.Bottling_Group.BOTTLE_4_VERTICAL.Value = 100
             Else
                 Var.Bottling_Group.BOTTLE_4_VERTICAL.Value = _
                     CLng((Var.Bottling_Group.FINAL_PICKER_HEIGHT.Value * 100) / 399)
             End If
         
             ' Advance to Step 5 as soon as destination is reached
             If Var.Bottling_Group.FINAL_PICKER_HEIGHT.Value >= 399 _
                Or Var.Bottling_Group.BOTTLE_4_VERTICAL.Value >= 100 Then
         
                 Var.Bottling_Group.FINAL_PICKER_HEIGHT.Value = 399
                 Var.Bottling_Group.BOTTLE_4_VERTICAL.Value = 100
         
                 Var.Bottling_Group.PICKER_STEP.Value = 5
             End If

         ' STEP 5: Reset after Bottle 4 reaches its destination
         ElseIf Var.Bottling_Group.PICKER_STEP.Value = 5 Then
             
             ' ===== DATABASE INTEGRATION: BOTTLE PACKED EVENT =====
             dbPackPend = dbPackPend + 1
             ' ===== DATABASE INTEGRATION: END =====
             
             ' COUNT ONE COMPLETED BOTTLE 4 IN THE BOX
             Var.Bottling_Group.BOTTLE_4_COUNT.Value = _
                 Var.Bottling_Group.BOTTLE_4_COUNT.Value + 1
             
             If Var.Bottling_Group.BOTTLE_4_COUNT.Value = 1 Then
                 Var.Bottling_Group.BOX_CAP_1_VISIBLE.Value = True
                 Var.Bottling_Group.BOX_CAP_2_VISIBLE.Value = False
                 Var.Bottling_Group.BOX_CAP_3_VISIBLE.Value = False
             
             ElseIf Var.Bottling_Group.BOTTLE_4_COUNT.Value = 2 Then
                 Var.Bottling_Group.BOX_CAP_1_VISIBLE.Value = True
                 Var.Bottling_Group.BOX_CAP_2_VISIBLE.Value = True
                 Var.Bottling_Group.BOX_CAP_3_VISIBLE.Value = False
             
             ElseIf Var.Bottling_Group.BOTTLE_4_COUNT.Value >= 3 Then
                 Var.Bottling_Group.BOTTLE_4_COUNT.Value = 3
             
                 Var.Bottling_Group.BOX_CAP_1_VISIBLE.Value = True
                 Var.Bottling_Group.BOX_CAP_2_VISIBLE.Value = True
                 Var.Bottling_Group.BOX_CAP_3_VISIBLE.Value = True
             
                 Var.Bottling_Group.BOTTLE_4_DONE_3.Value = True
             End If

             ' RESET FINAL BOTTLE 4 (it is now safely inside the box)
             Var.Bottling_Group.BOTTLE_4_VISIBLE.Value = False
             Var.Bottling_Group.BOTTLE_4_VERTICAL.Value = 0
         
             ' RESET FINAL PICKER
             Var.Bottling_Group.FINAL_PICKER_VISIBLE.Value = False
             Var.Bottling_Group.FINAL_PICKER_HEIGHT.Value = 0
         
             ' RESET LARGE PICKER
             Var.Bottling_Group.LARGE_PICKER_VISIBLE.Value = False
             Var.Bottling_Group.LARGE_PICKER_HEIGHT.Value = 0
             Var.Bottling_Group.LARGE_PICKER_HORIZONTAL.Value = 0
         
             ' RESTORE SMALL PICKER HOME STATE
             Var.Bottling_Group.SMALL_PICKER_VISIBLE.Value = True
             Var.Bottling_Group.SMALL_PICKER_HEIGHT.Value = 0
         
             ' RESET BOTTLE 3
             Var.Bottling_Group.BOTTLE_3_VISIBLE.Value = False
             Var.Bottling_Group.BOTTLE_3_VERTICAL.Value = 0
             Var.Bottling_Group.BOTTLE_3_HORIZONTAL.Value = 0
         
             ' RESET STEP COUNTER TO READY
             Var.Bottling_Group.PICKER_STEP.Value = 0

         End If

     Else
     
         ' PLC PICKER is OFF and sequence is complete: maintain home state
         Var.Bottling_Group.SMALL_PICKER_VISIBLE.Value = True
         Var.Bottling_Group.SMALL_PICKER_HEIGHT.Value = 0
     
         Var.Bottling_Group.LARGE_PICKER_VISIBLE.Value = False
         Var.Bottling_Group.LARGE_PICKER_HEIGHT.Value = 0
         Var.Bottling_Group.LARGE_PICKER_HORIZONTAL.Value = 0
     
         Var.Bottling_Group.FINAL_PICKER_VISIBLE.Value = False
         Var.Bottling_Group.FINAL_PICKER_HEIGHT.Value = 0
     
         Var.Bottling_Group.BOTTLE_4_VISIBLE.Value = False
         Var.Bottling_Group.BOTTLE_4_VERTICAL.Value = 0

         Var.Bottling_Group.PICKER_STEP.Value = 0
     
     End If

 Else

     ' Idle state when no bottle and sequence is complete
     Var.Bottling_Group.SMALL_PICKER_VISIBLE.Value = True
     Var.Bottling_Group.SMALL_PICKER_HEIGHT.Value = 0

     Var.Bottling_Group.LARGE_PICKER_VISIBLE.Value = False
     Var.Bottling_Group.LARGE_PICKER_HEIGHT.Value = 0
     Var.Bottling_Group.LARGE_PICKER_HORIZONTAL.Value = 0

     Var.Bottling_Group.FINAL_PICKER_VISIBLE.Value = False
     Var.Bottling_Group.FINAL_PICKER_HEIGHT.Value = 0

     Var.Bottling_Group.BOTTLE_4_VISIBLE.Value = False
     Var.Bottling_Group.BOTTLE_4_VERTICAL.Value = 0

     Var.Bottling_Group.PICKER_STEP.Value = 0

 End If
 
 
 ' DETECT PACKING COMPLETION
 
 If Var.Bottling_Group.PACKING_SENSOR.Value = True Then
     Var.Bottling_Group.PACKING_SENSOR_SEEN.Value = True
 End If
 
 If Var.Bottling_Group.PACKING_SENSOR_SEEN.Value = True _
    And Var.Bottling_Group.PACKING.Value = True Then
 
     Var.Bottling_Group.PACKING_WAS_ON.Value = True
 
 End If
 
 If Var.Bottling_Group.PACKING_SENSOR_SEEN.Value = True _
    And Var.Bottling_Group.PACKING_WAS_ON.Value = True _
    And Var.Bottling_Group.PACKING.Value = False Then
 
     Var.Bottling_Group.PACKING_DONE.Value = True
 
 End If
 
 
 ' =========================================================
 ' =========================================================
' BOX 1 -> BOX 2 -> BOX 3 + TRAY SEQUENCE
' =========================================================

' STEP 0: WAIT FOR 3 BOTTLE 4 COMPLETIONS, THEN MOVE BOX 1
If Var.Bottling_Group.BOX_STEP.Value = 0 Then
		
	    If Var.Bottling_Group.PLC_BOTTLE_COUNT.Value = 0 _
	       And Var.Bottling_Group.BOX_CONV.Value = True _
	       And Var.Bottling_Group.BOX_CAP_1_VISIBLE.Value = True _
	       And Var.Bottling_Group.BOX_CAP_2_VISIBLE.Value = True _
	       And Var.Bottling_Group.BOX_CAP_3_VISIBLE.Value = True Then
			       

        Var.Bottling_Group.BOX_1_VISIBLE.Value = True
        Var.Bottling_Group.BOX_2_VISIBLE.Value = False
        Var.Bottling_Group.BOX_3_VISIBLE.Value = False

        If Var.Bottling_Group.BOX_1_HORIZONTAL.Value < 169 Then
            Var.Bottling_Group.BOX_1_HORIZONTAL.Value = Var.Bottling_Group.BOX_1_HORIZONTAL.Value + 13
        End If


		If Var.Bottling_Group.BOX_1_HORIZONTAL.Value >= 169 Then
		
		    Var.Bottling_Group.BOX_1_HORIZONTAL.Value = 169
		
		   
		
		    Var.Bottling_Group.BOX_STEP.Value = 10
		
		End If
    End If

' STEP 10: BOX 1 HAS REACHED ITS DESTINATION
ElseIf Var.Bottling_Group.BOX_STEP.Value = 10 Then

    Var.Bottling_Group.BOX_1_HORIZONTAL.Value = 169
    Var.Bottling_Group.BOX_1_VISIBLE.Value = True

    Var.Bottling_Group.BOTTLE_4_DONE_3.Value = False
    Var.Bottling_Group.BOTTLE_4_COUNT.Value = 0
    Var.Bottling_Group.BOX_CAP_1_VISIBLE.Value = False
    Var.Bottling_Group.BOX_CAP_2_VISIBLE.Value = False
    Var.Bottling_Group.BOX_CAP_3_VISIBLE.Value = False


	Var.Bottling_Group.BOX_1_HORIZONTAL.Value = 0
	Var.Bottling_Group.BOX_1_VISIBLE.Value = False
	Var.Bottling_Group.BOX_2_HORIZONTAL.Value = 0
	
	' RESET PACKING COMPLETION FLAGS FOR THE NEW BOX 2
	' (the PACKING_SENSOR itself is controlled only by the sensor block at the top of this script)
	Var.Bottling_Group.PACKING_SENSOR_SEEN.Value = False
	Var.Bottling_Group.PACKING_WAS_ON.Value = False
	Var.Bottling_Group.PACKING_DONE.Value = False
	
	' SHOW THE NEW BOX 2
	Var.Bottling_Group.BOX_2_VISIBLE.Value = True
	Var.Bottling_Group.BOX_STEP.Value = 1


' STEP 1: BOX 2 MOVES AFTER BOX 1 FINISHES
ElseIf Var.Bottling_Group.BOX_STEP.Value = 1 Then

    Var.Bottling_Group.BOX_1_VISIBLE.Value = False
    Var.Bottling_Group.BOX_2_VISIBLE.Value = True
    Var.Bottling_Group.BOX_3_VISIBLE.Value = False

    If Var.Bottling_Group.PACKING_DONE.Value = True Then

        If Var.Bottling_Group.BOX_CONV.Value = True Or Var.Bottling_Group.BOX_2_HORIZONTAL.Value > 0 Then

            If Var.Bottling_Group.BOX_2_HORIZONTAL.Value < 291 Then
                Var.Bottling_Group.BOX_2_HORIZONTAL.Value = Var.Bottling_Group.BOX_2_HORIZONTAL.Value + 13
                If Var.Bottling_Group.BOX_2_HORIZONTAL.Value > 291 Then
                    Var.Bottling_Group.BOX_2_HORIZONTAL.Value = 291
                End If
            End If

            If Var.Bottling_Group.BOX_2_HORIZONTAL.Value >= 291 Then

                Var.Bottling_Group.BOX_2_HORIZONTAL.Value = 0
                Var.Bottling_Group.BOX_2_VISIBLE.Value = False
				Var.Bottling_Group.PACKING_DONE.Value = False
				Var.Bottling_Group.PACKING_SENSOR_SEEN.Value = False
				Var.Bottling_Group.PACKING_WAS_ON.Value = False
				
				' (packing and tray sensors reset themselves in the sensor block at the top
				'  as soon as BOX_2_VISIBLE / BOX_3_VISIBLE change)

				Var.Bottling_Group.BOX_3_VERTICAL.Value = 0
				Var.Bottling_Group.TRAY_VERTICAL.Value = 0
				Var.Bottling_Group.TRAY_TOP_VERTICAL.Value = 0
				Var.Bottling_Group.TRAY_BOTTOM_VERTICAL.Value = 0
				
				' SHOW BOX 3
				Var.Bottling_Group.BOX_3_VISIBLE.Value = True
				Var.Bottling_Group.TRAY_TOP_VISIBLE.Value = True
				Var.Bottling_Group.TRAY_BOTTOM_VISIBLE.Value = False
				' RESET TRAY SENSOR FOR THE NEW BOX 3
				Var.Bottling_Group.TRAY_SENSOR.Value = False
				Var.Bottling_Group.TRAY_SENSOR_START_TIME.Value = 0
				Var.Bottling_Group.TRAY_SENSOR_CYCLE_DONE.Value = False

                Var.Bottling_Group.BOX_STEP.Value = 2

            End If
        End If
    End If

' STEP 2: WAIT FOR PLC TRAY OUTPUT
ElseIf Var.Bottling_Group.BOX_STEP.Value = 2 Then

    Var.Bottling_Group.BOX_1_VISIBLE.Value = False
    Var.Bottling_Group.BOX_2_VISIBLE.Value = False
    Var.Bottling_Group.BOX_3_VISIBLE.Value = True
    Var.Bottling_Group.TRAY_TOP_VISIBLE.Value = True
    Var.Bottling_Group.TRAY_BOTTOM_VISIBLE.Value = False

    If Var.Bottling_Group.TRAY.Value = True Then
        Var.Bottling_Group.TRAY_TOP_VERTICAL.Value = 0
        Var.Bottling_Group.BOX_3_VERTICAL.Value = 0
        Var.Bottling_Group.TRAY_TOP_VISIBLE.Value = True
        Var.Bottling_Group.TRAY_BOTTOM_VISIBLE.Value = False
        Var.Bottling_Group.BOX_STEP.Value = 3
    End If

' STEP 3: MOVE BOX 3 AND TOP TRAY DOWN TOGETHER
ElseIf Var.Bottling_Group.BOX_STEP.Value = 3 Then

    If Var.Bottling_Group.TRAY.Value = False Then
        ' TRAY TURNED OFF BEFORE ARRIVAL: return to waiting state.
        Var.Bottling_Group.TRAY_TOP_VERTICAL.Value = 0
        Var.Bottling_Group.TRAY_BOTTOM_VERTICAL.Value = 0
        Var.Bottling_Group.TRAY_VERTICAL.Value = 0
        Var.Bottling_Group.BOX_3_VERTICAL.Value = 0
        Var.Bottling_Group.TRAY_TOP_VISIBLE.Value = True
        Var.Bottling_Group.TRAY_BOTTOM_VISIBLE.Value = False
        Var.Bottling_Group.BOX_3_VISIBLE.Value = True
        Var.Bottling_Group.BOX_STEP.Value = 2
    Else
        Var.Bottling_Group.BOX_3_VISIBLE.Value = True
        Var.Bottling_Group.TRAY_TOP_VISIBLE.Value = True
        Var.Bottling_Group.TRAY_BOTTOM_VISIBLE.Value = False

        If Var.Bottling_Group.BOX_3_VERTICAL.Value < 100 Then
            Var.Bottling_Group.BOX_3_VERTICAL.Value = Var.Bottling_Group.BOX_3_VERTICAL.Value + 8
            If Var.Bottling_Group.BOX_3_VERTICAL.Value > 100 Then
                Var.Bottling_Group.BOX_3_VERTICAL.Value = 100
            End If
        End If

        Var.Bottling_Group.TRAY_TOP_VERTICAL.Value = Var.Bottling_Group.BOX_3_VERTICAL.Value

        If Var.Bottling_Group.BOX_3_VERTICAL.Value >= 100 Then
            ' Arrival: reset Boxes 1, 2 and 3; hide top tray; show bottom tray and Box 4.
            Var.Bottling_Group.BOX_1_HORIZONTAL.Value = 0
            Var.Bottling_Group.BOX_2_HORIZONTAL.Value = 0
            Var.Bottling_Group.BOX_3_VERTICAL.Value = 0
            Var.Bottling_Group.TRAY_TOP_VERTICAL.Value = 0
            Var.Bottling_Group.TRAY_BOTTOM_VERTICAL.Value = 0
            Var.Bottling_Group.TRAY_VERTICAL.Value = 0

            Var.Bottling_Group.BOX_1_VISIBLE.Value = True
            Var.Bottling_Group.BOX_2_VISIBLE.Value = False
            Var.Bottling_Group.BOX_3_VISIBLE.Value = False
            Var.Bottling_Group.TRAY_TOP_VISIBLE.Value = False
            Var.Bottling_Group.TRAY_BOTTOM_VISIBLE.Value = True
            Var.Bottling_Group.BOX_4_HORIZONTAL.Value = 0
            Var.Bottling_Group.BOX_4_VERTICAL.Value = 0
            Var.Bottling_Group.BOX_4_VISIBLE.Value = True
            Var.Bottling_Group.BOX_5_HORIZONTAL.Value = 0
            Var.Bottling_Group.BOX_5_VISIBLE.Value = False

            Var.Bottling_Group.BOX_STEP.Value = 0
        End If
    End If

' STEP 4: WAIT FOR PLC TRAY OFF; RESET TOP TRAY TO ITS HOME POSITION.
ElseIf Var.Bottling_Group.BOX_STEP.Value = 4 Then

    If Var.Bottling_Group.TRAY.Value = False Then
        Var.Bottling_Group.TRAY_TOP_VERTICAL.Value = 0
        Var.Bottling_Group.TRAY_VERTICAL.Value = 0
        Var.Bottling_Group.TRAY_BOTTOM_VERTICAL.Value = 0
        Var.Bottling_Group.TRAY_TOP_VISIBLE.Value = True
        ' Keep the current bottom-tray visibility until Box 5 completes.
    End If

End If



' DETECT TRAY ON
If Var.Bottling_Group.TRAY.Value = True Then
    Var.Bottling_Group.TRAY_WAS_ON.Value = True
End If


' RESET BOTH TRAYS ONLY WHEN PUSHER CHANGES FROM ON TO OFF
If Var.Bottling_Group.PUSHER.Value = True Then

    Var.Bottling_Group.PUSHER_WAS_ON.Value = True

ElseIf Var.Bottling_Group.PUSHER_WAS_ON.Value = True Then

    ' Reset both trays to home position
    Var.Bottling_Group.TRAY_TOP_VERTICAL.Value = 0
    Var.Bottling_Group.TRAY_BOTTOM_VERTICAL.Value = 0
    Var.Bottling_Group.TRAY_VERTICAL.Value = 0

    ' Show top tray and hide bottom tray
    Var.Bottling_Group.TRAY_TOP_VISIBLE.Value = True
    Var.Bottling_Group.TRAY_BOTTOM_VISIBLE.Value = False

    ' Retract pusher
    Var.Bottling_Group.PUSHER_LENGTH.Value = 0

    ' Clear the transition flag
    Var.Bottling_Group.PUSHER_WAS_ON.Value = False

    ' Reset tray memory
    Var.Bottling_Group.TRAY_WAS_ON.Value = False

End If



' =========================================================
' BOX 4 -> BOX 5 SEQUENCE
' PUSHER STARTS THE SEQUENCE ONLY
' =========================================================

' STEP 0: WAIT FOR PUSHER ON
If Var.Bottling_Group.BOX_45_STEP.Value = 0 Then

	If Var.Bottling_Group.PUSHER.Value = True _
	   And Var.Bottling_Group.BOX_4_VISIBLE.Value = True Then

        Var.Bottling_Group.BOX_4_HORIZONTAL.Value = 0
        Var.Bottling_Group.BOX_4_VERTICAL.Value = 0
        Var.Bottling_Group.BOX_5_HORIZONTAL.Value = 0
        Var.Bottling_Group.PUSHER_LENGTH.Value = 0

        Var.Bottling_Group.BOX_4_VISIBLE.Value = True
        Var.Bottling_Group.BOX_5_VISIBLE.Value = False

        ' Lock in the sequence; PUSHER may now turn OFF.
        Var.Bottling_Group.BOX_45_STEP.Value = 1

    End If

' STEP 1: MOVE BOX 4 LEFT AND EXTEND PUSHER
ElseIf Var.Bottling_Group.BOX_45_STEP.Value = 1 Then

    If Var.Bottling_Group.BOX_4_HORIZONTAL.Value < 204 Then
        Var.Bottling_Group.BOX_4_HORIZONTAL.Value = _
            Var.Bottling_Group.BOX_4_HORIZONTAL.Value + 13.6

        If Var.Bottling_Group.BOX_4_HORIZONTAL.Value > 204 Then
            Var.Bottling_Group.BOX_4_HORIZONTAL.Value = 204
        End If
    End If


    Var.Bottling_Group.PUSHER_LENGTH.Value = _
        (Var.Bottling_Group.BOX_4_HORIZONTAL.Value / 204) * 329

    If Var.Bottling_Group.BOX_4_HORIZONTAL.Value >= 204 Then
        Var.Bottling_Group.BOX_4_HORIZONTAL.Value = 204
        Var.Bottling_Group.PUSHER_LENGTH.Value = 329
        Var.Bottling_Group.BOX_45_STEP.Value = 2
    End If


' STEP 2: MOVE BOX 4 DOWN
ElseIf Var.Bottling_Group.BOX_45_STEP.Value = 2 Then

    If Var.Bottling_Group.BOX_4_VERTICAL.Value < 48 Then
        Var.Bottling_Group.BOX_4_VERTICAL.Value = _
            Var.Bottling_Group.BOX_4_VERTICAL.Value + 9.6

        If Var.Bottling_Group.BOX_4_VERTICAL.Value > 48 Then
            Var.Bottling_Group.BOX_4_VERTICAL.Value = 48
        End If
    End If

    If Var.Bottling_Group.BOX_4_VERTICAL.Value >= 48 Then
        Var.Bottling_Group.BOX_4_VERTICAL.Value = 48
        Var.Bottling_Group.BOX_4_VISIBLE.Value = False
        Var.Bottling_Group.BOX_5_VISIBLE.Value = True
        Var.Bottling_Group.BOX_5_HORIZONTAL.Value = 0
        Var.Bottling_Group.BOX_45_STEP.Value = 3
    End If

' STEP 3: MOVE BOX 5 LEFT
ElseIf Var.Bottling_Group.BOX_45_STEP.Value = 3 Then

    Var.Bottling_Group.BOX_4_VISIBLE.Value = False
    Var.Bottling_Group.BOX_5_VISIBLE.Value = True

    If Var.Bottling_Group.BOX_5_HORIZONTAL.Value < 244 Then
        Var.Bottling_Group.BOX_5_HORIZONTAL.Value = _
            Var.Bottling_Group.BOX_5_HORIZONTAL.Value + 8

        If Var.Bottling_Group.BOX_5_HORIZONTAL.Value > 244 Then
            Var.Bottling_Group.BOX_5_HORIZONTAL.Value = 244
        End If
    End If

    If Var.Bottling_Group.BOX_5_HORIZONTAL.Value >= 244 Then
        Var.Bottling_Group.BOX_5_HORIZONTAL.Value = 244
        Var.Bottling_Group.BOX_45_STEP.Value = 4
    End If

' STEP 4: BOX 5 REACHED DESTINATION; RESET ANIMATION
ElseIf Var.Bottling_Group.BOX_45_STEP.Value = 4 Then

    Var.Bottling_Group.BOX_4_VISIBLE.Value = False
    Var.Bottling_Group.BOX_5_VISIBLE.Value = False

    Var.Bottling_Group.BOX_4_HORIZONTAL.Value = 0
    Var.Bottling_Group.BOX_4_VERTICAL.Value = 0
    Var.Bottling_Group.BOX_5_HORIZONTAL.Value = 0
    

    ' Reset only after the full sequence finishes.
    Var.Bottling_Group.BOX_45_STEP.Value = 5
    
' STEP 5: WAIT FOR PLC PUSHER OFF, THEN RETRACT PUSHER

ElseIf Var.Bottling_Group.BOX_45_STEP.Value = 5 Then

    If Var.Bottling_Group.PUSHER.Value = False Then

        ' Retract pusher to its initial state
        Var.Bottling_Group.PUSHER_LENGTH.Value = 0

        ' Allow the next Box 4/5 cycle
        Var.Bottling_Group.BOX_45_STEP.Value = 0

    End If

End If


' ==========================================
' BOTTLE FILL + TANK DRAIN: 10 SECONDS
' REPEATING CYCLE
' ==========================================


' 1. START THE FILL CYCLE THE MOMENT THE FILL SENSOR TURNS ON
' (FILL_START_TIME = time the sensor turned ON)
If Var.Bottling_Group.BOT_FILL_SENSOR.Value = True _
   And Var.Bottling_Group.BOT_FILL_CYCLE_STARTED.Value = False _
   And Var.Bottling_Group.BOT_FILL_DONE.Value = False Then

    Var.Bottling_Group.FILL_START_TIME.Value = Timer
    Var.Bottling_Group.TANK_LEVEL_AT_FILL_START.Value = _
        Var.Bottling_Group.TANK_LEVEL.Value
    Var.Bottling_Group.BOTTLE_1_LEVEL.Value = 0
    Var.Bottling_Group.BOT_FILL_CYCLE_STARTED.Value = True

End If


' 2. FILL ANIMATION 0 -> 100% OVER 10 SECONDS,
'    THEN FILL SENSOR TURNS OFF AFTER 12 SECONDS OF BEING ON
If Var.Bottling_Group.BOT_FILL_CYCLE_STARTED.Value = True _
   And Var.Bottling_Group.BOT_FILL_DONE.Value = False Then

    ' Safety: if the start time was lost, restart it now so the bottle
    ' can never jump straight to 100%
    If Var.Bottling_Group.FILL_START_TIME.Value = 0 Then
        Var.Bottling_Group.FILL_START_TIME.Value = Timer
    End If

    elapsed = Timer - Var.Bottling_Group.FILL_START_TIME.Value

    ' Only treat it as a midnight rollover if the gap is really large.
    ' (A tiny negative value is just rounding of the stored time and must
    '  NOT be turned into ~86400 seconds, which caused the instant 100%.)
    If elapsed < -1 Then
        elapsed = elapsed + 86400
    End If
    If elapsed < 0 Then elapsed = 0

    If elapsed < 10 Then

        ' Animated filling
        Var.Bottling_Group.BOTTLE_1_LEVEL.Value = elapsed * 10

        Var.Bottling_Group.TANK_LEVEL.Value = _
            Var.Bottling_Group.TANK_LEVEL_AT_FILL_START.Value - elapsed

        If Var.Bottling_Group.TANK_LEVEL.Value < 0 Then
            Var.Bottling_Group.TANK_LEVEL.Value = 0
        End If

    Else

        ' Bottle full after 10 seconds; turn the fill valve OFF
        Var.Bottling_Group.BOTTLE_1_LEVEL.Value = 100
        Var.Bottling_Group.BOT_FILL_VALVE.Value = False

    End If

    ' After 12 seconds of the sensor being ON: finish the cycle
    ' (BOT_FILL_DONE = True makes the fill sensor turn OFF below)
    If elapsed >= 12 Then
        Var.Bottling_Group.BOTTLE_1_LEVEL.Value = 100
        Var.Bottling_Group.BOT_FILL_VALVE.Value = False
        Var.Bottling_Group.BOT_FILL_DONE.Value = True
        Var.Bottling_Group.BOT_FILL_CYCLE_STARTED.Value = False
    End If

End If


' 3. SAVE PREVIOUS VALVE STATE
Var.Bottling_Group.BOT_FILL_VALVE_PREV.Value = _
    Var.Bottling_Group.BOT_FILL_VALVE.Value


' 4. REFILL TANK WHEN FILL VALVE IS OFF
If Var.Bottling_Group.BOT_FILL_VALVE.Value = False _
   And Var.Bottling_Group.PUMP.Value = True _
   And Var.Bottling_Group.TANK_HIGH_LEVEL_SENSOR.Value = False Then

    If Var.Bottling_Group.TANK_LEVEL.Value < 100 Then
        Var.Bottling_Group.TANK_LEVEL.Value = _
            Var.Bottling_Group.TANK_LEVEL.Value + 1
    End If

End If


' 5. RESET AT HOME POSITION ONLY WHEN VALVE IS OFF
If Var.Bottling_Group.BOTTLE_POSITION.Value = 0 _
   And Var.Bottling_Group.BOT_FILL_VALVE.Value = False Then

    Var.Bottling_Group.BOTTLE_1_LEVEL.Value = 0
    Var.Bottling_Group.FILL_START_TIME.Value = 0
    Var.Bottling_Group.BOT_FILL_DONE.Value = False
    Var.Bottling_Group.BOT_FILL_CYCLE_STARTED.Value = False

End If


' ==========================================
' AUTOMATIC SENSOR CONTROL
' ==========================================

' 1. TANK HIGH-LEVEL SENSOR
If Var.Bottling_Group.TANK_LEVEL.Value > 90 Then
    Var.Bottling_Group.TANK_HIGH_LEVEL_SENSOR.Value = True
Else
    Var.Bottling_Group.TANK_HIGH_LEVEL_SENSOR.Value = False
End If



' SECTION 2: BOTTLE FILLING SENSOR

If Var.Bottling_Group.BOTTLE_POSITION.Value < 23 Then

    Var.Bottling_Group.BOT_FILL_SENSOR.Value = False

ElseIf Var.Bottling_Group.BOT_FILL_DONE.Value = False Then

    Var.Bottling_Group.BOT_FILL_SENSOR.Value = True

Else

    Var.Bottling_Group.BOT_FILL_SENSOR.Value = False

End If



' SECTION 3: BOTTLE INSPECTION AND REJECTION

If Var.Bottling_Group.BOTTLE_POSITION.Value < 61 Then

    Var.Bottling_Group.BOT_CHECK_SENSOR.Value = False
    Var.Bottling_Group.BOT_CHECK_DONE.Value = False
    Var.Bottling_Group.BOT_CHECK_START_TIME.Value = 0

ElseIf Var.Bottling_Group.BOT_CHECK_DONE.Value = False Then

    ' Keep conveyor stopped during inspection
    Var.Bottling_Group.BOT_CHECK_SENSOR.Value = True

    ' Start inspection only when bottle reaches position 61
    If Var.Bottling_Group.BOT_CHECK_START_TIME.Value = 0 Then
        Var.Bottling_Group.BOT_CHECK_START_TIME.Value = Timer
        elapsed = 0
    Else
        elapsed = Timer - Var.Bottling_Group.BOT_CHECK_START_TIME.Value
        If elapsed < -1 Then
            elapsed = elapsed + 86400
        End If
        If elapsed < 0 Then
            elapsed = 0
        End If
    End If

    ' Do not evaluate weight until 3.5 seconds have passed
    If elapsed >= 3.5 Then

        If Var.Bottling_Group.WEIGHT_SENSOR.Value = True Then

            ' ===== DATABASE INTEGRATION: INSPECTION PASSED EVENT =====
            If dbBottleActive = True Then
                dbInspResult = 1
                dbInspBottleNo = dbBottleNo
                dbInspStage = 1
            End If
            ' ===== DATABASE INTEGRATION: END =====

            ' Accept bottle only after inspection time
            Var.Bottling_Group.BOT_CHECK_DONE.Value = True
            Var.Bottling_Group.BOT_CHECK_SENSOR.Value = False
            Var.Bottling_Group.BOT_CHECK_START_TIME.Value = 0

        ElseIf Var.Bottling_Group.BOT_REJECTOR.Value = True Then

            ' ===== DATABASE INTEGRATION: INSPECTION REJECTED EVENT =====
            If dbBottleActive = True Then
                dbInspResult = 2
                dbInspBottleNo = dbBottleNo
                dbInspStage = 1
                dbBottleActive = False
            End If
            ' ===== DATABASE INTEGRATION: END =====

            ' Reject bottle
            Var.Bottling_Group.BOTTLE_POSITION.Value = 0
            Var.Bottling_Group.BOTTLE_1_LEVEL.Value = 0
            Var.Bottling_Group.BOTTLE_1_TICK.Value = 0
            Var.Bottling_Group.BOTTLE_VISIBLE.Value = True

            Var.Bottling_Group.BOT_FILL_SENSOR.Value = False
            Var.Bottling_Group.BOT_FILL_DONE.Value = False
            Var.Bottling_Group.BOT_FILL_CYCLE_STARTED.Value = False
            Var.Bottling_Group.FILL_START_TIME.Value = 0

            Var.Bottling_Group.BOT_FILL_VALVE_PREV.Value = _
                Var.Bottling_Group.BOT_FILL_VALVE.Value

            Var.Bottling_Group.BOT_CHECK_SENSOR.Value = False
            Var.Bottling_Group.BOT_CHECK_DONE.Value = False
            Var.Bottling_Group.BOT_CHECK_START_TIME.Value = 0

        End If

    End If

Else

    Var.Bottling_Group.BOT_CHECK_SENSOR.Value = False

End If



' 4. BOTTLE CAP SENSOR
' TURN ON WHEN BOTTLE 1 REACHES FINAL POSITION

If Var.Bottling_Group.BOTTLE_POSITION.Value >= 100 _
   And Var.Bottling_Group.BOT_CHECK_DONE.Value = True _
   And Var.Bottling_Group.BOTTLE_2_VISIBLE.Value = False _
   And Var.Bottling_Group.CAPPING_STEP.Value = 0 Then

    Var.Bottling_Group.BOT_CAP_SENSOR.Value = True

ElseIf Var.Bottling_Group.BOTTLE_POSITION.Value < 100 Then

    Var.Bottling_Group.BOT_CAP_SENSOR.Value = False

End If


' 5. BOT PICK SENSOR - 1 SECOND PULSE
' Trigger: BOTTLE_3_VISIBLE


If Var.Bottling_Group.BOTTLE_3_VISIBLE.Value = True Then

    If Var.Bottling_Group.BOT_PICK_SENSOR.Value = False Then

        If Var.Bottling_Group.BOT_PICK_START_TIME.Value = 0 Then
            Var.Bottling_Group.BOT_PICK_START_TIME.Value = Timer
            Var.Bottling_Group.BOT_PICK_SENSOR.Value = True
        End If

    End If

End If

' Turn sensor OFF after 1 second
If Var.Bottling_Group.BOT_PICK_SENSOR.Value = True Then

    elapsed = Timer - Var.Bottling_Group.BOT_PICK_START_TIME.Value

    If elapsed < 0 Then
        elapsed = elapsed + 86400
    End If

    If elapsed >= 1 Then
        Var.Bottling_Group.BOT_PICK_SENSOR.Value = False
        Var.Bottling_Group.BOT_PICK_START_TIME.Value = 0
    End If

End If


' ==========================================================================
' ==========================================================================
' ===== DATABASE INTEGRATION: START (SQL PROCESSOR - runs LAST each tick) ==
' ZERO-INTERFERENCE & TIMING-PRESERVATION GUARANTEE:
' 1. Never executes SQL while ANY timed sensor or filling cycle is active.
'    (PACKING_SENSOR, TRAY_SENSOR, BOT_CHECK_SENSOR, BOT_PICK_SENSOR,
'     BOT_FILL_CYCLE_STARTED). This guarantees 100% native tick speed and
'     unbroken sensor ON/OFF timing windows identical to original code.
' 2. Executes AT MOST ONE statement per tick, throttled to >= 200 ms cadence
'    during untimed transit phases, preventing any multi-tick frame drops.
' ==========================================================================
dbTarget = 0   ' <<< CONFIGURE: planned bottles per batch. 0 = unknown, batch never auto-completes.
dbKind = 0
dbObj = 0
dbSql = ""
dbCan = True

' Defensive initialization for uninitialized script-level variables
If IsEmpty(dbInitStage) Then dbInitStage = 0
If IsEmpty(dbBottleActive) Then dbBottleActive = False
If IsEmpty(dbBottleNo) Then dbBottleNo = 0
If IsEmpty(dbNbStage) Then dbNbStage = 0
If IsEmpty(dbInspStage) Then dbInspStage = 0
If IsEmpty(dbInspResult) Then dbInspResult = 0
If IsEmpty(dbInspBottleNo) Then dbInspBottleNo = 0
If IsEmpty(dbCapPend) Then dbCapPend = False
If IsEmpty(dbCapBottleNo) Then dbCapBottleNo = 0
If IsEmpty(dbPackPend) Then dbPackPend = 0
If IsEmpty(dbPackingSensorPrev) Then dbPackingSensorPrev = False
If IsEmpty(dbBoxPackPend) Then dbBoxPackPend = 0
If IsEmpty(dbBatchStarted) Then dbBatchStarted = False
If IsEmpty(dbLastExec) Then dbLastExec = 0
If IsEmpty(dbLastFail) Then dbLastFail = 0
If IsEmpty(dbLastErr) Then dbLastErr = ""
If IsEmpty(dbProv) Then dbProv = ""

' --------------------------------------------------------------------------
' GATE 1: SENSOR TIMING PROTECTION
' Absolutely NO SQL execution while ANY time-critical sensor is active!
' --------------------------------------------------------------------------
If Var.Bottling_Group.PACKING_SENSOR.Value = True Then dbCan = False
If Var.Bottling_Group.TRAY_SENSOR.Value = True Then dbCan = False
If Var.Bottling_Group.BOT_CHECK_SENSOR.Value = True Then dbCan = False
If Var.Bottling_Group.BOT_PICK_SENSOR.Value = True Then dbCan = False
If Var.Bottling_Group.BOT_FILL_CYCLE_STARTED.Value = True Then dbCan = False
If Var.Bottling_Group.BOX_STEP.Value = 1 Then dbCan = False

' --------------------------------------------------------------------------
' GATE 2: THROTTLING PROTECTION
' Enforce at least 200 ms spacing between consecutive SQL calls to keep
' the tick rate and conveyor animation completely smooth.
' --------------------------------------------------------------------------
If dbCan Then
    dbElapsedExec = Timer - dbLastExec
    If dbElapsedExec < 0 Then dbElapsedExec = dbElapsedExec + 86400
    If dbElapsedExec < 0.2 Then dbCan = False
End If

' --------------------------------------------------------------------------
' GATE 3: FAILURE BACKOFF PROTECTION
' Back off for 3 seconds if an error occurred, preventing error loops.
' --------------------------------------------------------------------------
If dbCan And dbLastFail > 0 Then
    dbElapsedFail = Timer - dbLastFail
    If dbElapsedFail < 0 Then dbElapsedFail = dbElapsedFail + 86400
    If dbElapsedFail < 3 Then dbCan = False
End If

If dbCan Then

    If dbInitStage = 0 Then
        ' Create the single summary row only if the table is empty
        dbKind = 1
        dbObj = 0
        dbSql = "INSERT INTO bottling_plant_db.production_summary (total_bottles, accepted_bottles, rejected_bottles) " & _
                "SELECT 0, 0, 0 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM bottling_plant_db.production_summary)"

    ElseIf dbInitStage = 1 Then
        ' Create a batch only if no open (non-Completed) batch exists
        dbKind = 2
        dbObj = 2
        dbSql = "INSERT INTO bottling_plant_db.production_batch (batch_number, target_quantity, produced_quantity, batch_status) " & _
                "SELECT CONCAT('BATCH-', LPAD(x.c + 1, 3, '0')), " & CStr(CLng(dbTarget)) & ", 0, 'Not Started' " & _
                "FROM (SELECT COUNT(*) AS c FROM bottling_plant_db.production_batch) x " & _
                "WHERE NOT EXISTS (SELECT 1 FROM bottling_plant_db.production_batch WHERE batch_status <> 'Completed')"

    ElseIf dbInitStage = 2 Then
        ' Continue bottle numbering from the highest count in production_summary
        dbKind = 3
        dbObj = 0
        dbSql = "SELECT COALESCE(MAX(total_bottles), 0) FROM bottling_plant_db.production_summary"

    ElseIf dbNbStage = 1 Then
        ' Increment total_bottles in production_summary
        dbKind = 4
        dbObj = 0
        dbSql = "UPDATE bottling_plant_db.production_summary SET total_bottles = total_bottles + 1 ORDER BY id LIMIT 1"

    ElseIf dbNbStage = 2 Then
        ' Insert new bottle row into production_log matching production_summary.total_bottles
        dbKind = 5
        dbObj = 0
        dbSql = "INSERT INTO bottling_plant_db.production_log (bottle_number, weight_status, cap_status, inspection_status) " & _
                "SELECT total_bottles, 'Pending', 'Pending', 'Pending' FROM bottling_plant_db.production_summary ORDER BY id LIMIT 1"

    ElseIf dbBatchStarted = False Then
        ' Mark active batch as In Progress (runs once at batch start)
        dbKind = 6
        dbObj = 0
        dbSql = "UPDATE bottling_plant_db.production_batch SET batch_status = 'In Progress' " & _
                "WHERE batch_status = 'Not Started' ORDER BY id DESC LIMIT 1"

    ElseIf dbInspStage = 1 Then
        ' Update inspection and weight status for the active bottle in production_log
        If dbInspResult = 1 Then
            dbWS = "OK"
            dbIS = "Passed"
        Else
            dbWS = "Low Weight"
            dbIS = "Rejected"
        End If
        dbKind = 7
        dbObj = 0
        dbSql = "UPDATE bottling_plant_db.production_log SET weight_status = '" & dbWS & "', inspection_status = '" & dbIS & "' " & _
                "ORDER BY id DESC LIMIT 1"

    ElseIf dbInspStage = 2 Then
        ' Update accepted or rejected bottle count in production_summary
        If dbInspResult = 1 Then
            dbCol = "accepted_bottles"
        Else
            dbCol = "rejected_bottles"
        End If
        dbKind = 8
        dbObj = 0
        dbSql = "UPDATE bottling_plant_db.production_summary SET " & dbCol & " = " & dbCol & " + 1 ORDER BY id LIMIT 1"

    ElseIf dbCapPend = True Then
        ' Update cap status for the capped bottle in production_log
        dbKind = 9
        dbObj = 0
        dbSql = "UPDATE bottling_plant_db.production_log SET cap_status = 'Capped' ORDER BY id DESC LIMIT 1"

    ElseIf dbPackPend > 0 Then
        ' Increment produced_quantity in production_batch (and auto-complete if target met)
        dbKind = 10
        dbObj = 0
        dbSql = "UPDATE bottling_plant_db.production_batch SET produced_quantity = produced_quantity + 1, " & _
                "batch_status = IF(target_quantity > 0 AND produced_quantity >= target_quantity, 'Completed', 'In Progress') " & _
                "WHERE batch_status <> 'Completed' ORDER BY id DESC LIMIT 1"

    ElseIf dbBoxPackPend > 0 Then
        ' Increment total_box_packed in production_summary
        dbKind = 11
        dbObj = 0
        dbSql = "UPDATE bottling_plant_db.production_summary SET total_box_packed = total_box_packed + 1 ORDER BY id LIMIT 1"
    End If

    If dbKind > 0 Then

        On Error Resume Next
        Err.Clear

        ' All tables reside in bottling_plant_db. Use the primary, verified connection for all queries.
        dbConn = "DbAccess.DatabaseAccess"

        If dbProv = "" Then
            dbProv = DbAccess.DatabaseAccess.Provider
        End If

        If dbKind = 3 Then
            dbRes = DbAccess.DatabaseAccess.ExecuteScalar(dbSql)
            If Err.Number <> 0 Or IsEmpty(dbRes) Or IsNull(dbRes) Then
                Err.Clear
                dbRes = DbAccessCmd.ExecuteScalar(dbConn, dbProv, dbSql)
            End If
        Else
            Call DbAccessCmd.ExecuteNonQuery(dbConn, dbProv, dbSql)
        End If

        dbErrNum = Err.Number
        dbErrDesc = Err.Description
        On Error GoTo 0

        If dbErrNum = 0 Then

            dbLastExec = Timer
            dbLastFail = 0

            If dbKind = 1 Then
                dbInitStage = 1
            ElseIf dbKind = 2 Then
                dbInitStage = 2
            ElseIf dbKind = 3 Then
                If IsNumeric(dbRes) Then
                    dbBottleNo = CLng(dbRes)
                Else
                    dbBottleNo = 0
                End If
                dbInitStage = 3
            ElseIf dbKind = 4 Then
                dbNbStage = 2
            ElseIf dbKind = 5 Then
                dbNbStage = 0
            ElseIf dbKind = 6 Then
                dbBatchStarted = True
            ElseIf dbKind = 7 Then
                dbInspStage = 2
            ElseIf dbKind = 8 Then
                dbInspStage = 0
                dbInspResult = 0
            ElseIf dbKind = 9 Then
                dbCapPend = False
            ElseIf dbKind = 10 Then
                dbPackPend = dbPackPend - 1
            ElseIf dbKind = 11 Then
                dbBoxPackPend = dbBoxPackPend - 1
            End If

        Else
            ' Failure: step NOT marked complete, retry after 3 s backoff
            dbLastFail = Timer
            dbLastErr = "kind " & CStr(dbKind) & " err " & CStr(dbErrNum) & ": " & dbErrDesc
            On Error Resume Next
            Dim fsoLog, tsLog
            Set fsoLog = CreateObject("Scripting.FileSystemObject")
            Set tsLog = fsoLog.OpenTextFile("C:\Users\pb539\Desktop\PROJECT\bottling_plant_api\db_error.log", 8, True)
            tsLog.WriteLine Now & " - " & dbLastErr
            tsLog.Close
            Set tsLog = Nothing
            Set fsoLog = Nothing
            Err.Clear
            On Error GoTo 0
        End If

    End If

End If
' ===== DATABASE INTEGRATION: END =====


End Sub