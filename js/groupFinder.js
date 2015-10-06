/**
 * Code Sample submitted from Eddie Hinkle
 * This code is an interactive JavaScript widget built inside of a custom Drupal 7 module for LifePoint Church.
 * Stack used: Drupal 7
 * 
 * This file is an interactive group finder. It asks people specific questions, their gender, relationship status,
 * what neighborhood they live in, priorities in a small group, etc. It then calculates values and returns the top 3
 * suggested small groups for them to attend.
 */

var neighborhoods, primaryactivities, results_container, sg_matches;
var first_name, last_name, email, phone, phone_last_value;

function get_question_order() {
  return ["gender", "relationship", "attend_with", "age", "children", "same_gender", "neighborhood", "focus", "most_important"];
}

function run_group_finder() {
  $(function() {
    
    get_neighborhoods();
    get_primaryactivities();
    
    // Create Fullscreen Button
    var fullscreen_btn = $('<div>').attr("id", "fullscreen-btn").text("Fullscreen").appendTo("#group-finder");
    fullscreen_btn.click(function(){
      $('#group-finder').toggleFullScreen();
    });
    $(document).bind("fullscreenchange", function() {
      update_fullscreen_btn();
    });
    
    // it's showtime!
    run_introduction();
    
  });
}

function show_loader(loading_statement) {
  loading_graph = $("<div>").attr("class", "loading hidden").attr("id", "loading-graphic").appendTo("#group-finder");
  loading_string = $("<div>").attr("class", "hidden").attr("id", "loading-string").text(loading_statement).appendTo("#group-finder");
  setTimeout(function(){
    loading_graph.removeClass("hidden");
    loading_string.removeClass("hidden");
  }, 100);
}

function hide_loader() {
  loading_graph.addClass("hidden");
  loading_string.addClass("hidden");
  setTimeout(function(){
    loading_graph.remove();
    loading_string.remove();
  }, 700);
}

function get_neighborhoods(return_value){
  if (neighborhoods === undefined) {  
    $.getJSON("/sg/api/neighborhoods/all", function(data) {
      neighborhoods = data;
    });
  }
  if (return_value) {
    return neighborhoods;
  }
}

function get_primaryactivities(return_value){
  if (primaryactivities === undefined) {  
    $.getJSON("/sg/api/smallgroup/activitybased", function(data) {
      primaryactivities = data;
    });
  }
  if (return_value) {
    return primaryactivities;
  }
}

function update_fullscreen_btn() {
  if ($("#group-finder").fullScreen()) {
    $('#fullscreen-btn').text("Exit Fullscreen");
  } else {
    $('#fullscreen-btn').text("Fullscreen");
  }
}

function run_introduction(restarted) {
  // if restarted, hide all elements
  if (restarted) {
    start_btn.unbind("click", restart_button_event);
    hide_screen(finder.transition_length);
  } else {
    question = $('<div>').attr("id", "question").attr("class", "question primary-color hidden question-top").appendTo("#group-finder");
  }
  
  finder = get_questions_object();
  
  // Introduction Question
  question.text("Hi! I'd like to find your best fit for a small group. In order to do that, I'll need to ask you just a couple of questions. Don't worry, I promise it won't get too personal or take too long!");
  setTimeout(function(){
    question.removeClass("hidden");
  
    questionOrder = get_question_order();
    if (!restarted) {
      start_btn = $('<div>').attr("id", "start-btn").attr("class", "button hidden").text("Connect").appendTo("#group-finder");
      answers = $('<div>').attr("id", "answers").attr("class", "hidden").appendTo("#group-finder");
    } else {
      start_btn.text("Start");
    }
    start_btn.click(start_button_event);
    setTimeout(function(){
      start_btn.removeClass("hidden");
      
    }, finder.transition_length);
    
  }, finder.transition_length+300);
}

function start_button_event(evt) {
  // Hide introductions and then move to next
  hide_screen(finder.transition_length);
  setTimeout(function(){
    run_question(questionOrder);
  }, finder.transition_length);
}

function restart_button_event() {
  clearTimeout(restart_timeout);
  run_introduction(true);
}

function gather_user_info() {
  clearTimeout(reset_to_beginning);
  hide_screen();
  
  question.text("We'll send you the contact information for your top small groups and we'll let them know you were selected as a match.").removeClass("question-top question-top-right question-top-left").addClass("question-top");
  first_name = $("<input>").attr("type", "textfield").attr("placeholder", "First").attr("id", "user-first-name").attr("class", "user-field hidden").appendTo("#group-finder");
  last_name = $("<input>").attr("type", "textfield").attr("placeholder", "Last").attr("id", "user-last-name").attr("class", "user-field hidden").appendTo("#group-finder");
  email = $("<input>").attr("type", "textfield").attr("placeholder", "Email").attr("id", "user-email").attr("class", "user-field hidden").appendTo("#group-finder");
  phone = $("<input>").attr("type", "textfield").attr("placeholder", "Phone").attr("id", "user-phone").attr("class", "user-field hidden").appendTo("#group-finder");
  
  start_btn.unbind("click", gather_user_info);
  start_btn.click(send_user_info);
  
  setTimeout(function(){
    question.removeClass("hidden");
    first_name.removeClass("hidden");
    last_name.removeClass("hidden");
    email.removeClass("hidden");
    phone.removeClass("hidden");
    start_btn.text("Submit").addClass("send-info").removeClass("hidden");
    first_name.focus();
  }, finder.transition_length);
  
}

function phone_number_verify(evt) {
  var phone_value = evt.target.value;
  
  phone_value.replace("-", "");
  if (phone_value.length > 2) {
    new_phone_value = phone_value.substring(0, 2) + "-";
    if (phone_value.length > 3 && phone_value.length < 6) {
      new_phone_value += phone_value.substr(3, phone_value.length-3);
    }
  }
  if (phone_value.length > 5) {
    new_phone_value += phone_value.substr(3, 5) + "-";
    if (phone_value.length > 6) {
      new_phone_value += phone_value.substr(6, phone_value.length-6);
    }
  }
  
  $(phone).val(new_phone_value);
}

function send_user_info() {
  hide_screen();
  first_name.addClass("hidden");
  last_name.addClass("hidden");
  email.addClass("hidden");
  phone.addClass("hidden");
  
  var ui = {
    first: first_name.val(),
    last: last_name.val(),
    email: email.val(),
    phone: phone.val(),
    matched_sg: [sg_matches[0].id, sg_matches[1].id, sg_matches[2].id]
  }
  
  show_loader("Sending your matches contact info...");
  $.get("/sg/api/sendmatches",
    {
     first_name: ui.first,
     last_name: ui.last,
     email: ui.email,
     phone: ui.phone,
     gender: finder.questions.gender.chosen_answer,
     matches: ui.matched_sg
    }, user_info_processed); 
  
  
  setTimeout(function(){
    first_name.remove();
    last_name.remove();
    email.remove();
    phone.remove();
  }, finder.transition_length);
}

function user_info_processed(data){
  hide_loader();
  response = $.parseJSON(data);
  if (response.success) {
    question_restart(); 
  } else {
    question_restart(true);
  }
}

function hide_screen(hide_speed) {
  if (results_container !== undefined) {
    results_container.addClass("hidden");
  }
  setTimeout(function(){
    question.addClass("hidden");
    start_btn.addClass("hidden");
    answers.addClass("hidden");
  }, 200);
  
  setTimeout(function(){
    $(".answer").unbind("click", answer_was_clicked);
    answers.empty();
  }, 500);
}

function answer_was_clicked(evt) {
  currentQuestion = evt.originalEvent.target.dataset.questionValue;
  answerSelected = evt.originalEvent.target.dataset.answerValue;
  finder.questions[currentQuestion].chosen_answer = answerSelected;
  // Hide Elements on Screen
  hide_screen(finder.transition_length);
  // Set a delay between hiding and next question
  setTimeout(function(){
    // Recursive call to run the next question
    run_question(questionOrder);
  }, finder.transition_length); // end new question delay
}

function run_question(questionOrder) {
  // verify that there is another question
  if (questionOrder.length > 0) {
    // get the next question
    var nextQuestion = questionOrder.shift();
    var q = finder.questions[nextQuestion];

    if (question_should_run(q)) {
      // Check if I need to retrieve data
      if (q.retrieve_answers !== undefined) {
        $.extend(q.possible_answers, window[q.retrieve_answers](true));
      }
      
      // View question text
      var question_text = q.text;
      // Check if we need to replace any template text
      if (q.templates !== undefined) {
        // loop through all placeholders
        $.each(q.templates, function(qname, replacements){
          // retrieve the replacement value based on the placeholder's answer with the replacement values
          var replacement_value = replacements[finder.questions[qname].chosen_answer];
          // replace the replacement placeholder with value
          question_text = question_text.replace("{" + qname + "}", replacement_value);
        });
      }
      
      // add question
      question.text(question_text).removeClass("question-top question-top-right question-top-left").addClass(q.position).removeClass("hidden");
      
      answers.addClass(q.answer_position);
      var tempAnswers = [];
      $.each(q.possible_answers, function(v, a){
        if (v != "answers") {
          var tempAnswer = $('<div>').attr("data-question-value", nextQuestion).attr("data-answer-value", v).attr("class", "answer").text(a);
          if (q.answers_reverse) {
            tempAnswers.push(tempAnswer);
          } else {
            tempAnswer.appendTo(answers);
          }
        }
      });
      if (q.answers_reverse) {
        while(tempAnswers.length > 0) {
          var tempAnswer = tempAnswers.pop();
          tempAnswer.appendTo(answers);
        }
      }
      $(".answer").click(answer_was_clicked);
      answers.removeClass("hidden");
      
    } else {
      run_question(questionOrder);
    }
  } else {
    // No more questions
    process_results();
  }
}

function process_results() {
  hide_screen();
  show_loader("Finding your best fit small group...");
  $.get("/sg/api/bestfit",
    {
     gender: finder.questions.gender.chosen_answer,
     relationship: finder.questions.relationship.chosen_answer,
     attend_with: finder.questions.attend_with.chosen_answer,
     age: finder.questions.age.chosen_answer,
     children: finder.questions.children.chosen_answer,
     neighborhood: finder.questions.neighborhood.chosen_answer,
     focus: finder.questions.focus.chosen_answer,
     most_important: finder.questions.most_important.chosen_answer
    }, results_processed); 
}

function results_processed(data, status, xhr) {
  var sg_data = $.parseJSON(data);
  var smallgroups = sg_data["Small Groups"].Available;
  var scores = sg_data["scores"];
  // Get the first small group
  var top_sg = scores.pop();
  // Get the second small group
  var second_sg = scores.pop();
  // Get the third small group
  var third_sg = scores.pop();
  
  display_results([
    smallgroups[top_sg.sg],
    smallgroups[second_sg.sg],
    smallgroups[third_sg.sg]
  ]);
}

function display_results(sgs) {
  sg_matches = sgs;
  question.text("It's time! I've looked at our small groups and these were the top small groups that matched your interests. Click the button below to get their info via email").removeClass("question-top question-top-right question-top-left").addClass("question-top");
  start_btn.unbind("click", start_button_event);
  start_btn.click(gather_user_info);
  start_btn.text("Send me this info").addClass("send-info");
  
  results_container = $("<div>").attr("id", "sg_results").attr("class", "hidden");
  results_container.appendTo("#group-finder");
  
  displayTimeout = display_three_top_sg();
}

function display_three_top_sg() {
  // Go through the first, second and third matched small groups
  $.each(sg_matches, function(idx, sg){
    // Display a single small group
    var topsg = $("<div>").attr("class", "top-sg").appendTo(results_container);
    $("<h1>").text(sg.name).appendTo(topsg);
    var dayofweek = "";
    if (sg.frequency == "weekly") {
      dayofweek = "Every " + sg.meeting_day;
    } else if (sg.frequency == "bi-weekly") {
      dayofweek = "Every other " + sg.meeting_day;
    } else if (sg.frequency == "monthly") {
      dayofweek = "One " + sg.meeting_day + " a month";
    }
    dayofweek += " at " + sg.starting_time;
    $("<p>").text(dayofweek).appendTo(topsg);
    
    var meeting_location = "Meets at ";
    if (sg.location_name !== null) {
      meeting_location = sg.location_name;
    } else {
      if (sg.location_type == "residence" || sg.location_type == "commercial") {
        meeting_location = sg.neighborhood + " " + sg.location_type;
      } else if (sg.location_type == "church") {
        meeting_location = sg.neighborhood;
      }
    }
    $("<p>").text(meeting_location).appendTo(topsg);
    
    var meeting_topic = "";
    if (sg.activity !== null) {
      meeting_topic = sg.activity + " Group";
    } else {
      switch(sg.type) {
        case 'topical':
          meeting_topic = "Topical Study";
          break;
        case 'biblestudy':
          meeting_topic = "Bible Study";
          break;
        case 'sermonbased':
          meeting_topic = "Sermon-based Discussion";
          break;
      }
    }
    $("<p>").text(meeting_topic).appendTo(topsg);
  });
  
  return setTimeout(function(){
    hide_loader();
    question.removeClass("hidden");
    results_container.removeClass("hidden");
    start_btn.removeClass("hidden");
    reset_to_beginning = setTimeout(function(){
      start_btn.unbind("click", gather_user_info);
      start_btn.click(send_user_info);
      question_restart();
    }, 180000);
  }, finder.transition_length*2);
}

function question_restart(failed) {
  if (failed) {
    question_text = "We are extremely sorry. There was an error. Please try again.";
  } else {
    question_text = "Thank you for using the Interactive Small Group Finder! Let a friend know about it!";
  }
  
  question.text(question_text).removeClass("question-top question-top-right question-top-left").addClass("question-top").removeClass("hidden");
  start_btn.unbind("click", send_user_info);
  start_btn.click(restart_button_event);
  start_btn.text("Restart").removeClass("hidden");
  restart_timeout = setTimeout(function(){
    if (results_container !== undefined) {
      $("#sg_results").remove();
      results_container = undefined;
    }
    run_introduction(true);
  }, 5000);
}

function question_should_run(question) {
  var should_run = false;
  if (question.dependance == undefined) {
    should_run = true;
  } else {
    // Look through all dependances, if one dependance is true, allow question
    $.each(question.dependance, function(i, d){
      // Verify that question has been answered
      if (finder.questions[d.question].chosen_answer !== undefined) {
        // check if dependance is based on negation
        if (d.comparison_type == "negation") {
          should_run = true;
        }
        // loop through all possible correct values
        $.each(d.verified_values, function(i, possible_value){
          // if one of the selected values is found
          if (possible_value == finder.questions[d.question].chosen_answer) {
            // if it's negation, send false. If it's not, send true
            should_run = (d.comparison_type == "negation" ? false : true);
            if (should_run) {
              return false;
            }
          }
        });
        
        if (should_run) {
          return false;
        }
      }
    });
  }
  
  // return whether the question should be run
  return should_run;
}

function get_questions_object() {
  return { transition_length: 500,
    questions: {
      gender: {
        text: "Are you a man or a woman?",
        position: "question-top-left",
        answer_position: "answers-bottom-right",
        possible_answers: {
          male: "Man",
          female: "Woman",
          answers: 2
        }
      },
      relationship: {
        text: "What is your relationship status?",
        position: "question-top-left",
        answer_position: "answers-bottom-right",
        possible_answers: {
          single: 'Single',
          dating: 'Dating',
          engaged: 'Engaged',
          married: 'Married',
          answers: 4
        }
      },
      age: {
        text: "What Age Group are you part of?",
        position: "question-top-left",
        answer_position: "answers-bottom-right",
        possible_answers: {
          CA: "College Age (18-21)",
          YA: "Young Adult (22-29)",
          Z30: "30's",
          Z40: "40's",
          Z50: "50's",
          Z60: "60's",
          Z70: "70's",
          Z80: "80's",
          answers: 8
        }
      },
      attend_with: {
        text: "Would you like to attend with your spouse",
        position: "question-top-left",
        answer_position: "answers-bottom-right",
        possible_answers: {
          yes: "Yes",
          no: "No",
          answers: 2
        },
        dependance: [
          {
            question: "relationship",
            verified_values: [
              "married"
            ]
          }
        ]
      },
      same_gender: {
        text: "Would you prefer a small group with only other {gender}?",
        templates: {
          gender: {
            male: "men",
            female: "women"
          }
        },
        position: "question-top-left",
        answer_position: "answers-bottom-right",
        possible_answers: {
          yes: "Yes",
          no: "No",
          answers: 2
        },
        dependance: [
          {
            question: "relationship",
            comparison_type: "negation",
            verified_values: [
              "married"
            ]
          },
          {
            question: "attend_with",
            verified_values: [
              "no"
            ]
          }
        ]
      },
      children: {
        text: "Do you have children living at home?",
        position: "question-top-left",
        answer_position: "answers-bottom-right",
        possible_answers: {
          yes: "Yes",
          no: "No",
          answers: 2
        }
      },
      neighborhood: {
        text: "Which neighborhood do you live closest to?",
        position: "question-top-left",
        answer_position: "answers-bottom-right",
        answers_reverse: true,
        retrieve_answers: "get_neighborhoods",
        possible_answers: {
        }
      },
      focus: {
        text: "What interests you the most?",
        position: "question-top-left",
        answer_position: "answers-bottom-right",
        retrieve_answers: "get_primaryactivities",
        possible_answers: {
          biblestudy: "Studying the Bible",
          sermonbased: "Sermon based",
          topical: "A Topical Study"
        }
      },
      most_important: {
        text: "Which is most important to you when choosing a small group?",
        position: "question-top-left",
        answer_position: "answers-bottom-right",
        possible_answers: {
          similar_life: "People in similar life stage",
          close_home: "Meets close to my home",
          topic_interest: "A topic that interests me"
        }
      }
    }
  };
}
